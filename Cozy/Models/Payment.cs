using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Cozy.Models
{
    public class Payment
    {
        [Key]
        public int Id { get; set; }

        public int CustomerId { get; set; }

        [ForeignKey("CustomerId")]
        public Customer? Customer { get; set; }

        public int? QuotationId { get; set; }

        [ForeignKey("QuotationId")]
        public Quotation? Quotation { get; set; }

        [Required]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty; // 例: "專案頭期款", "維護費 $5000"

        [Column(TypeName = "decimal(18, 2)")]
        public decimal Amount { get; set; } = 0;

        public DateTime PaymentDate { get; set; } = DateTime.UtcNow;

        [MaxLength(50)]
        public string PaymentMethod { get; set; } = "匯款"; // 現金, 匯款, 信用卡, LINE Pay, 支票

        [MaxLength(50)]
        public string Status { get; set; } = "已收款"; // 待收款, 已收款, 已開立發票, 已退款

        public string? InvoiceNumber { get; set; }

        public string? Notes { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
