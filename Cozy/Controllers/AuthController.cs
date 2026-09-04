using System;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Cozy.Data;
using Cozy.Models;

namespace Cozy.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _config;
        private static readonly HttpClient _httpClient = new HttpClient();

        public AuthController(AppDbContext context, IConfiguration config)
        {
            _context = context;
            _config = config;
        }

        public class GoogleAuthRequest
        {
            public string? Credential { get; set; } // Google ID Token
            public string? Email { get; set; }      // Optional direct email in development
            public string? Name { get; set; }
            public string? Picture { get; set; }
        }

        public class GoogleTokenInfo
        {
            public string? email { get; set; }
            public string? name { get; set; }
            public string? picture { get; set; }
            public string? email_verified { get; set; }
            public string? error_description { get; set; }
        }

        // GET: api/auth/config
        [HttpGet("config")]
        public IActionResult GetConfig()
        {
            string clientId = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID") 
                ?? _config["Authentication:Google:ClientId"] 
                ?? "";
            
            return Ok(new { clientId });
        }

        // POST: api/auth/google
        [HttpPost("google")]
        public async Task<IActionResult> GoogleLogin([FromBody] GoogleAuthRequest req)
        {
            try
            {
                string email = "";
                string name = "";
                string picture = "";

                if (!string.IsNullOrWhiteSpace(req.Credential))
                {
                    // Verify ID Token with Google official tokeninfo API
                    try
                    {
                        var response = await _httpClient.GetAsync($"https://oauth2.googleapis.com/tokeninfo?id_token={req.Credential}");
                        if (response.IsSuccessStatusCode)
                        {
                            var tokenInfo = await response.Content.ReadFromJsonAsync<GoogleTokenInfo>();
                            if (tokenInfo != null && !string.IsNullOrWhiteSpace(tokenInfo.email))
                            {
                                email = tokenInfo.email.Trim().ToLowerInvariant();
                                name = tokenInfo.name ?? req.Name ?? email.Split('@')[0];
                                picture = tokenInfo.picture ?? req.Picture ?? "";
                            }
                        }
                    }
                    catch { }

                    // Fallback to decode JWT payload if direct network lookup is skipped
                    if (string.IsNullOrWhiteSpace(email))
                    {
                        var parts = req.Credential.Split('.');
                        if (parts.Length >= 2)
                        {
                            string payloadBase64 = parts[1].PadRight(parts[1].Length + (4 - parts[1].Length % 4) % 4, '=')
                                .Replace('-', '+').Replace('_', '/');
                            byte[] bytes = Convert.FromBase64String(payloadBase64);
                            var jsonDoc = JsonDocument.Parse(bytes);
                            if (jsonDoc.RootElement.TryGetProperty("email", out var emailProp))
                            {
                                email = emailProp.GetString()?.Trim().ToLowerInvariant() ?? "";
                            }
                            if (jsonDoc.RootElement.TryGetProperty("name", out var nameProp))
                            {
                                name = nameProp.GetString() ?? "";
                            }
                            if (jsonDoc.RootElement.TryGetProperty("picture", out var picProp))
                            {
                                picture = picProp.GetString() ?? "";
                            }
                        }
                    }
                }
                else if (!string.IsNullOrWhiteSpace(req.Email))
                {
                    email = req.Email.Trim().ToLowerInvariant();
                    name = req.Name ?? email.Split('@')[0];
                    picture = req.Picture ?? "";
                }

                if (string.IsNullOrWhiteSpace(email))
                {
                    return BadRequest(new { message = "無法讀取或驗證 Google 帳號 Email" });
                }

                string rootAdminEmail = (Environment.GetEnvironmentVariable("SUPER_ADMIN_EMAIL") 
                    ?? "huang761027@gmail.com").Trim().ToLowerInvariant();

                // Check if user exists in whitelist
                var user = await _context.SystemUsers.FirstOrDefaultAsync(u => u.Email.ToLower() == email);

                // Auto-seed root admin if it doesn't exist
                if (user == null && (email == rootAdminEmail || !await _context.SystemUsers.AnyAsync()))
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

                // Issue secure session cookie
                Response.Cookies.Append("Cozy_User_Email", user.Email, new CookieOptions
                {
                    HttpOnly = true,
                    Secure = true,
                    SameSite = SameSiteMode.Lax,
                    Expires = DateTimeOffset.UtcNow.AddDays(30)
                });

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
                return StatusCode(500, new { message = "登入驗證時發生錯誤: " + ex.Message });
            }
        }

        // GET: api/auth/me
        [HttpGet("me")]
        public async Task<IActionResult> GetCurrentUser([FromHeader(Name = "X-User-Email")] string? headerEmail)
        {
            string? email = Request.Cookies["Cozy_User_Email"] ?? headerEmail;
            
            // If empty, check if we have root admin fallback
            string rootAdminEmail = (Environment.GetEnvironmentVariable("SUPER_ADMIN_EMAIL") 
                ?? "huang761027@gmail.com").Trim().ToLowerInvariant();

            if (string.IsNullOrWhiteSpace(email))
            {
                return Unauthorized(new { message = "尚未登入" });
            }

            email = email.Trim().ToLowerInvariant();
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
            Response.Cookies.Delete("Cozy_User_Email");
            return Ok(new { message = "已安全登出" });
        }
    }
}
