using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Cozy.Models
{
    public class Customer
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(50)]
        public string? Phone { get; set; }

        [MaxLength(100)]
        public string? LineId { get; set; }

        [MaxLength(200)]
        public string? Address { get; set; }

        [MaxLength(100)]
        public string? Email { get; set; }

        public string? Notes { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonIgnore]
        public ICollection<WorkLog> WorkLogs { get; set; } = new List<WorkLog>();

        [JsonIgnore]
        public ICollection<Quotation> Quotations { get; set; } = new List<Quotation>();

        [JsonIgnore]
        public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    }
}
