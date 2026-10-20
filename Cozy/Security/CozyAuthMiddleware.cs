using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Cozy.Data;
using Cozy.Models;

namespace Cozy.Security
{
    public class CozyAuthMiddleware
    {
        private readonly RequestDelegate _next;

        public CozyAuthMiddleware(RequestDelegate next)
        {
            _next = next;
        }

        public async Task InvokeAsync(HttpContext context, AppDbContext dbContext)
        {
            var path = context.Request.Path.Value ?? "";

            // 0. Legacy uploads inside wwwroot must never be served publicly (use the authenticated download API)
            if (path.StartsWith("/uploads/", StringComparison.OrdinalIgnoreCase))
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }

            // 1. Allow Static files, Root index, and PWA assets
            if (!path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
            {
                await _next(context);
                return;
            }

            // 2. Allow Auth endpoints (login, config, me, logout)
            if (path.StartsWith("/api/auth/", StringComparison.OrdinalIgnoreCase))
            {
                await _next(context);
                return;
            }

            // 3. iCal subscription for external calendar apps: allowed only with the secret ICAL_TOKEN
            if (path.Equals("/api/worklogs/calendar.ics", StringComparison.OrdinalIgnoreCase) && HasValidIcalToken(context))
            {
                await _next(context);
                return;
            }

            // 4. Resolve authenticated email from the signed session cookie only
            string? email = CozySession.GetEmail(context);

            if (string.IsNullOrWhiteSpace(email))
            {
                await WriteError(context, StatusCodes.Status401Unauthorized, "🚫 未經授權存取：請先使用授權的 Google 帳號登入系統！");
                return;
            }

            SystemUser? user = await dbContext.SystemUsers.FirstOrDefaultAsync(u => u.Email.ToLower() == email);

            if (user == null || !user.IsActive)
            {
                await WriteError(context, StatusCodes.Status403Forbidden, "🚫 存取被拒：此 Google 帳號未在授權白名單內或已被停用！");
                return;
            }

            // Protect User Management endpoint - Admin only
            if (path.StartsWith("/api/users", StringComparison.OrdinalIgnoreCase) && user.Role != "Admin" && email != CozySession.RootAdminEmail)
            {
                await WriteError(context, StatusCodes.Status403Forbidden, "🚫 權限不足：只有超級管理者可管理使用者清單！");
                return;
            }

            // Attach current authenticated user to context
            context.Items["CurrentUser"] = user;

            await _next(context);
        }

        private static bool HasValidIcalToken(HttpContext context)
        {
            string? expected = Environment.GetEnvironmentVariable("ICAL_TOKEN");
            string? provided = context.Request.Query["token"].FirstOrDefault();
            if (string.IsNullOrWhiteSpace(expected) || string.IsNullOrWhiteSpace(provided)) return false;

            return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(provided));
        }

        private static async Task WriteError(HttpContext context, int statusCode, string message)
        {
            context.Response.StatusCode = statusCode;
            context.Response.ContentType = "application/json; charset=utf-8";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new { message }));
        }
    }
}
