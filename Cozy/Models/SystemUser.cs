using System;
using System.ComponentModel.DataAnnotations;

namespace Cozy.Models
{
    public class SystemUser
    {
        [Key]
        public int Id { get; set; }

        [Required(ErrorMessage = "Google 信箱為必填項目")]
        [EmailAddress(ErrorMessage = "請輸入有效的 Email 地址")]
        [MaxLength(150)]
        public string Email { get; set; } = string.Empty;

        [MaxLength(100)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(500)]
        public string? PictureUrl { get; set; }

        [MaxLength(50)]
        public string Role { get; set; } = "Staff"; // Admin (超級管理者), Staff (一般員工)

        public bool IsActive { get; set; } = true; // 是否啟用

        public DateTime? LastLoginAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
