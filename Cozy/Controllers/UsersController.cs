using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Cozy.Data;
using Cozy.Models;
using Cozy.Security;

namespace Cozy.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly AppDbContext _context;

        public UsersController(AppDbContext context)
        {
            _context = context;
        }

        // Helper to check admin permission
        private async Task<bool> IsAdminAsync()
        {
            string? email = CozySession.GetEmail(HttpContext);
            if (string.IsNullOrWhiteSpace(email)) return false;
            if (email == CozySession.RootAdminEmail) return true;

            var user = await _context.SystemUsers.FirstOrDefaultAsync(u => u.Email.ToLower() == email);
            return user != null && user.IsActive && user.Role == "Admin";
        }

        // 角色只允許 Admin / Staff（不分大小寫），其餘視為無效
        private static string? NormalizeRole(string? role)
        {
            if (string.IsNullOrWhiteSpace(role)) return null;
            if (string.Equals(role.Trim(), "Admin", StringComparison.OrdinalIgnoreCase)) return "Admin";
            if (string.Equals(role.Trim(), "Staff", StringComparison.OrdinalIgnoreCase)) return "Staff";
            return "";
        }

        // GET: api/Users
        [HttpGet]
        public async Task<ActionResult<IEnumerable<SystemUser>>> GetUsers()
        {
            if (!await IsAdminAsync())
            {
                return StatusCode(403, new { message = "只有超級管理者可以查看與管理使用者授權清單" });
            }

            var users = await _context.SystemUsers
                .OrderByDescending(u => u.Role == "Admin")
                .ThenByDescending(u => u.CreatedAt)
                .ToListAsync();

            return Ok(users);
        }

        // POST: api/Users
        [HttpPost]
        public async Task<ActionResult<SystemUser>> CreateUser([FromBody] SystemUser newUser)
        {
            if (!await IsAdminAsync())
            {
                return StatusCode(403, new { message = "只有超級管理者可以新增授權帳號" });
            }

            if (string.IsNullOrWhiteSpace(newUser.Email))
            {
                return BadRequest(new { message = "Google 信箱為必填項目" });
            }

            string cleanEmail = newUser.Email.Trim().ToLowerInvariant();
            if (await _context.SystemUsers.AnyAsync(u => u.Email.ToLower() == cleanEmail))
            {
                return BadRequest(new { message = $"信箱「{cleanEmail}」已經存在於授權名單中！" });
            }

            newUser.Email = cleanEmail;
            newUser.Name = !string.IsNullOrWhiteSpace(newUser.Name) ? newUser.Name.Trim() : cleanEmail.Split('@')[0];
            string? role = NormalizeRole(newUser.Role);
            if (role == "")
            {
                return BadRequest(new { message = "角色只能是 Admin 或 Staff" });
            }
            newUser.Role = role ?? "Staff";
            newUser.CreatedAt = DateTime.UtcNow;

            _context.SystemUsers.Add(newUser);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetUsers), new { id = newUser.Id }, newUser);
        }

        // PUT: api/Users/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateUser(int id, [FromBody] SystemUser updated)
        {
            if (!await IsAdminAsync())
            {
                return StatusCode(403, new { message = "只有超級管理者可以修改授權帳號" });
            }

            var existing = await _context.SystemUsers.FindAsync(id);
            if (existing == null)
            {
                return NotFound(new { message = "找不到此使用者" });
            }

            string? role = NormalizeRole(updated.Role);
            if (role == "")
            {
                return BadRequest(new { message = "角色只能是 Admin 或 Staff" });
            }

            // Prevent demoting or deactivating root super admin
            if (existing.Email.ToLower() == CozySession.RootAdminEmail && (!updated.IsActive || (role ?? existing.Role) != "Admin"))
            {
                return BadRequest(new { message = "創始超級管理者不可被停用或取消管理員權限" });
            }

            existing.Name = !string.IsNullOrWhiteSpace(updated.Name) ? updated.Name.Trim() : existing.Name;
            existing.Role = role ?? existing.Role;
            existing.IsActive = updated.IsActive;

            await _context.SaveChangesAsync();
            return Ok(existing);
        }

        // DELETE: api/Users/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteUser(int id)
        {
            if (!await IsAdminAsync())
            {
                return StatusCode(403, new { message = "只有超級管理者可以移除授權帳號" });
            }

            var user = await _context.SystemUsers.FindAsync(id);
            if (user == null)
            {
                return NotFound(new { message = "找不到此使用者" });
            }

            if (user.Email.ToLower() == CozySession.RootAdminEmail)
            {
                return BadRequest(new { message = "創始超級管理者帳號不可刪除" });
            }

            _context.SystemUsers.Remove(user);
            await _context.SaveChangesAsync();

            return Ok(new { message = "授權帳號已成功移除" });
        }
    }
}
