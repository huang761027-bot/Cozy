using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Cozy.Models
{
    public class WorkLog
    {
        [Key]
        public int Id { get; set; }

        public int? CustomerId { get; set; }

        [ForeignKey("CustomerId")]
        public Customer? Customer { get; set; }

        [Required]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty;

        public DateTime ScheduledAt { get; set; } = DateTime.UtcNow;

        [MaxLength(50)]
        public string Status { get; set; } = "待處理"; // 待處理, 進行中, 已完成, 已取消

        public DateTime? StatusUpdatedAt { get; set; }

        public bool IsPriority { get; set; } = false; // 是否優先處理 (*)

        public string? Details { get; set; }

        public string? Location { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
