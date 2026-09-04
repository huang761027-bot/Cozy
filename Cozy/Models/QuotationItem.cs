using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace Cozy.Models
{
    public class QuotationItem
    {
        [Key]
        public int Id { get; set; }

        public int QuotationId { get; set; }

        [ForeignKey("QuotationId")]
        [JsonIgnore]
        public Quotation? Quotation { get; set; }

        [Required]
        [MaxLength(200)]
        public string ItemName { get; set; } = string.Empty;

        public string? Description { get; set; }

        public decimal Quantity { get; set; } = 1;

        [MaxLength(20)]
        public string? Unit { get; set; } = "式";

        [Column(TypeName = "decimal(18, 2)")]
        public decimal UnitPrice { get; set; } = 0;

        [Column(TypeName = "decimal(18, 2)")]
        public decimal Subtotal { get; set; } = 0;
    }
}
