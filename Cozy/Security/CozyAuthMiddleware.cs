using System;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
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

        public async Task InvokeAsync(HttpContext context, IServiceProvider serviceProvider)
        {
            var path = context.Request.Path.Value ?? "";

            // 1. Allow Static files, Root index, and PWA assets
            if (!path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
            {
                await _next(context);
                return;
            }

            // 2. Allow Auth endpoints (login, config, me, logout) and public ical subscription
            if (path.StartsWith("/api/auth/", StringComparison.OrdinalIgnoreCase) ||
                path.Equals("/api/worklogs/calendar.ics", StringComparison.OrdinalIgnoreCase))
            {
                await _next(context);
                return;
            }

            // 3. Extract authenticated email from Cookie or custom Header
            string? email = context.Request.Cookies["Cozy_User_Email"]
                ?? context.Request.Headers["X-User-Email"].FirstOrDefault()
                ?? context.Request.Headers["Authorization"].FirstOrDefault()?.Replace("Bearer ", "", StringComparison.OrdinalIgnoreCase);

            if (string.IsNullOrWhiteSpace(email))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Response.ContentType = "application/json; charset=utf-8";
                var err = new { message = "🚫 未經授權存取：請先使用授權的 Google 帳號登入系統！" };
                await context.Response.WriteAsync(JsonSerializer.Serialize(err));
                return;
            }

            email = email.Trim().ToLowerInvariant();
            string rootAdminEmail = (Environment.GetEnvironmentVariable("SUPER_ADMIN_EMAIL") 
                ?? "huang761027@gmail.com").Trim().ToLowerInvariant();

            using (var scope = serviceProvider.CreateScope())
            {
                var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                
                var user = await dbContext.SystemUsers.FirstOrDefaultAsync(u => u.Email.ToLower() == email);

                // Auto seed root admin if database is new
                if (user == null && email == rootAdminEmail)
                {
                    user = new SystemUser
                    {
                        Email = email,
                        Name = "超級管理者",
                        Role = "Admin",
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    };
                    dbContext.SystemUsers.Add(user);
                    await dbContext.SaveChangesAsync();
                }

                if (user == null || !user.IsActive)
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    context.Response.ContentType = "application/json; charset=utf-8";
                    var err = new { message = "🚫 存取被拒：此 Google 帳號未在授權白名單內或已被停用！" };
                    await context.Response.WriteAsync(JsonSerializer.Serialize(err));
                    return;
                }

                // Protect User Management endpoint - Admin only
                if (path.StartsWith("/api/users", StringComparison.OrdinalIgnoreCase) && user.Role != "Admin" && email != rootAdminEmail)
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    context.Response.ContentType = "application/json; charset=utf-8";
                    var err = new { message = "🚫 權限不足：只有超級管理者可管理使用者清單！" };
                    await context.Response.WriteAsync(JsonSerializer.Serialize(err));
                    return;
                }

                // Attach current authenticated user to context
                context.Items["CurrentUser"] = user;
            }

            await _next(context);
        }
    }
}
