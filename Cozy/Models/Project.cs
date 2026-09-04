using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Cozy.Models
{
    public class Project
    {
        [Key]
        public int Id { get; set; }

        [Required(ErrorMessage = "專案編號為必填項目")]
        [MaxLength(50)]
        public string ProjectNumber { get; set; } = string.Empty; // 例: PRJ-001, 2026-D01

        [Required(ErrorMessage = "專案/案場名稱為必填項目")]
        [MaxLength(150)]
        public string Name { get; set; } = string.Empty; // 例: 敦化南路二段辦公室清潔案

        [Required(ErrorMessage = "請選擇關聯客戶/設計師/公司")]
        public int CustomerId { get; set; }

        public Customer? Customer { get; set; }

        [MaxLength(100)]
        public string? ContactPerson { get; set; } // 現場聯絡人/監工

        [MaxLength(50)]
        public string? ContactPhone { get; set; } // 現場聯絡電話

        [MaxLength(200)]
        public string? Address { get; set; } // 案場地址

        public decimal? Budget { get; set; } // 預算 / 預估金額

        [MaxLength(50)]
        public string Status { get; set; } = "進行中"; // 進行中, 待進場, 已完工, 已結案, 暫停

        public DateTime? StartDate { get; set; }

        public DateTime? EndDate { get; set; }

        public string? Notes { get; set; } // 施工規範、注意事項、門鎖密碼

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        // 附件檔案
        public ICollection<ProjectFile> Files { get; set; } = new List<ProjectFile>();

        [JsonIgnore]
        public ICollection<WorkLog> WorkLogs { get; set; } = new List<WorkLog>();

        [JsonIgnore]
        public ICollection<Quotation> Quotations { get; set; } = new List<Quotation>();

        [JsonIgnore]
        public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    }
}
