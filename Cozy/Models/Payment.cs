using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Cozy.Models
{
    public class Payment
    {
        [Key]
        public int Id { get; set; }

        public int? CustomerId { get; set; } // Nullable: 散客 / 現場購買可不填客戶

        [ForeignKey("CustomerId")]
        public Customer? Customer { get; set; }

        public int? QuotationId { get; set; }

        [ForeignKey("QuotationId")]
        public Quotation? Quotation { get; set; }

        [Required(ErrorMessage = "收費項目說明為必填項目")]
        [MaxLength(200)]
        public string Title { get; set; } = string.Empty; // 例: "購買產品A", "尾款 $5000"

        [Column(TypeName = "decimal(18, 2)")]
        public decimal Amount { get; set; } = 0;

        public DateTime PaymentDate { get; set; } = DateTime.UtcNow;

        [MaxLength(50)]
        public string PaymentMethod { get; set; } = "現金"; // 現金, 匯款, LINE Pay, 信用卡, 支票

        [MaxLength(50)]
        public string Status { get; set; } = "已收款"; // 待收款, 已收款, 已開立發票, 已退款

        public string? InvoiceNumber { get; set; }

        public string? InvoiceImageUrl { get; set; }

        public string? Notes { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
