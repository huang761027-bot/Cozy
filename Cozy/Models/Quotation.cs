using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Cozy.Models
{
    public class Quotation
    {
        [Key]
        public int Id { get; set; }

        [MaxLength(50)]
        public string QuotationNumber { get; set; } = string.Empty;

        public int CustomerId { get; set; }

        [ForeignKey("CustomerId")]
        public Customer? Customer { get; set; }

        public int? ProjectId { get; set; }

        [ForeignKey("ProjectId")]
        public Project? Project { get; set; }

        [MaxLength(200)]
        public string Title { get; set; } = string.Empty;

        public DateTime IssueDate { get; set; } = DateTime.UtcNow;

        public DateTime? ExpiryDate { get; set; }

        [Column(TypeName = "decimal(18, 2)")]
        public decimal TotalAmount { get; set; } = 0;

        [MaxLength(50)]
        public string Status { get; set; } = "草稿"; // 草稿, 已發送, 客戶確認, 已結案, 已取消

        public string? Notes { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public List<QuotationItem> Items { get; set; } = new List<QuotationItem>();
    }
}
