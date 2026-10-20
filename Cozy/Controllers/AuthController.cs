using System;
using System.Linq;
using System.Threading.Tasks;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Cozy.Data;
using Cozy.Models;
using Cozy.Security;

namespace Cozy.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _config;
        private readonly ILogger<AuthController> _logger;

        public AuthController(AppDbContext context, IConfiguration config, ILogger<AuthController> logger)
        {
            _context = context;
            _config = config;
            _logger = logger;
        }

        public class GoogleAuthRequest
        {
            public string? Credential { get; set; } // Google ID Token
        }

        private string GetClientId() =>
            Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID")
            ?? _config["Authentication:Google:ClientId"]
            ?? "";

        // GET: api/auth/config
        [HttpGet("config")]
        public IActionResult GetConfig()
        {
            return Ok(new { clientId = GetClientId() });
        }

        // POST: api/auth/google
        [HttpPost("google")]
        public async Task<IActionResult> GoogleLogin([FromBody] GoogleAuthRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Credential))
            {
                return BadRequest(new { message = "🚫 安全防護：必須透過 Google 官方登入彈窗進行密碼與身分驗證，禁止手動輸入信箱！" });
            }

            string clientId = GetClientId();
            if (string.IsNullOrWhiteSpace(clientId))
            {
                return StatusCode(500, new { message = "伺服器尚未設定 GOOGLE_CLIENT_ID，無法驗證 Google 登入。" });
            }

            // Verify ID Token signature, issuer, expiry and audience (must be issued for this app)
            GoogleJsonWebSignature.Payload payload;
            try
            {
                payload = await GoogleJsonWebSignature.ValidateAsync(req.Credential, new GoogleJsonWebSignature.ValidationSettings
                {
                    Audience = new[] { clientId }
                });
            }
            catch (Exception)
            {
                return BadRequest(new { message = "無法驗證 Google 官方憑證（Token 無效或過期），請重新嘗試登入。" });
            }

            if (string.IsNullOrWhiteSpace(payload.Email) || !payload.EmailVerified)
            {
                return BadRequest(new { message = "此 Google 帳號的 Email 尚未驗證，無法登入。" });
            }

            string email = payload.Email.Trim().ToLowerInvariant();
            string name = payload.Name ?? email.Split('@')[0];
            string picture = payload.Picture ?? "";

            try
            {
                var user = await _context.SystemUsers.FirstOrDefaultAsync(u => u.Email.ToLower() == email);

                // Auto-seed root admin if it doesn't exist
                if (user == null && email == CozySession.RootAdminEmail)
                {
                    user = new SystemUser
                    {
                        Email = email,
                        Name = !string.IsNullOrWhiteSpace(name) ? name : "超級管理者",
                        PictureUrl = picture,
                        Role = "Admin",
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    };
                    _context.SystemUsers.Add(user);
                    await _context.SaveChangesAsync();
                }

                // If user is not found in whitelist
                if (user == null)
                {
                    return StatusCode(403, new
                    {
                        message = $"🚫 存取被拒：您的 Google 帳號 ({email}) 尚未獲得系統授權，請聯繫超級管理員開通權限。",
                        email
                    });
                }

                // If user is disabled
                if (!user.IsActive)
                {
                    return StatusCode(403, new
                    {
                        message = $"⚠️ 帳號已被停用：您的帳號 ({email}) 目前處於停用狀態，請聯繫超級管理員。",
                        email
                    });
                }

                // Update user details
                if (!string.IsNullOrWhiteSpace(name)) user.Name = name;
                if (!string.IsNullOrWhiteSpace(picture)) user.PictureUrl = picture;
                user.LastLoginAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                // Issue signed session cookie
                CozySession.SignIn(HttpContext, user.Email);

                return Ok(new
                {
                    message = "登入成功",
                    user = new
                    {
                        user.Id,
                        user.Email,
                        user.Name,
                        user.PictureUrl,
                        user.Role,
                        user.IsActive,
                        user.LastLoginAt
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Google login failed for {Email}", email);
                return StatusCode(500, new { message = "登入驗證時發生錯誤，請稍後再試。" });
            }
        }

        // GET: api/auth/me
        [HttpGet("me")]
        public async Task<IActionResult> GetCurrentUser()
        {
            string? email = CozySession.GetEmail(HttpContext);
            if (string.IsNullOrWhiteSpace(email))
            {
                return Unauthorized(new { message = "尚未登入" });
            }

            var user = await _context.SystemUsers.FirstOrDefaultAsync(u => u.Email.ToLower() == email);

            if (user == null || !user.IsActive)
            {
                return Unauthorized(new { message = "帳號無效或未獲得授權" });
            }

            return Ok(new
            {
                user.Id,
                user.Email,
                user.Name,
                user.PictureUrl,
                user.Role,
                user.IsActive,
                user.LastLoginAt
            });
        }

        // POST: api/auth/logout
        [HttpPost("logout")]
        public IActionResult Logout()
        {
            CozySession.SignOut(HttpContext);
            return Ok(new { message = "已安全登出" });
        }
    }
}
