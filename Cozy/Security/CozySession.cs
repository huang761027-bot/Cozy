using System;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;

namespace Cozy.Security
{
    // 以 ASP.NET Data Protection 加密簽章的登入 Session Cookie（無法偽造或竄改）
    public static class CozySession
    {
        public const string CookieName = "Cozy_Session";
        private const string Purpose = "Cozy.Session.v1";
        public static readonly TimeSpan Lifetime = TimeSpan.FromDays(30);

        private static ITimeLimitedDataProtector GetProtector(HttpContext context)
        {
            var provider = (IDataProtectionProvider)context.RequestServices.GetService(typeof(IDataProtectionProvider))!;
            return provider.CreateProtector(Purpose).ToTimeLimitedDataProtector();
        }

        public static void SignIn(HttpContext context, string email)
        {
            string token = GetProtector(context).Protect(email.Trim().ToLowerInvariant(), Lifetime);
            context.Response.Cookies.Append(CookieName, token, new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Lax,
                Expires = DateTimeOffset.UtcNow.Add(Lifetime)
            });
        }

        public static void SignOut(HttpContext context)
        {
            context.Response.Cookies.Delete(CookieName);
            context.Response.Cookies.Delete("Cozy_User_Email"); // 清除舊版未簽章 Cookie
        }

        // 回傳已驗證的 Email；Cookie 不存在、遭竄改或已過期時回傳 null
        public static string? GetEmail(HttpContext context)
        {
            string? token = context.Request.Cookies[CookieName];
            if (string.IsNullOrWhiteSpace(token)) return null;

            try
            {
                return GetProtector(context).Unprotect(token);
            }
            catch
            {
                return null;
            }
        }

        public static string RootAdminEmail =>
            (Environment.GetEnvironmentVariable("SUPER_ADMIN_EMAIL") ?? "huang761027@gmail.com").Trim().ToLowerInvariant();
    }
}
