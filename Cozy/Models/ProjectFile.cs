using System;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Cozy.Models
{
    public class ProjectFile
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int ProjectId { get; set; }

        [JsonIgnore]
        public Project? Project { get; set; }

        [Required]
        [MaxLength(255)]
        public string FileName { get; set; } = string.Empty; // 原始檔名 (例: 施工圖紙v1.pdf)

        [Required]
        [MaxLength(255)]
        public string StoredFileName { get; set; } = string.Empty; // 磁碟儲存檔名

        [Required]
        [MaxLength(500)]
        public string FilePath { get; set; } = string.Empty; // 存取路徑

        [MaxLength(50)]
        public string FileType { get; set; } = string.Empty; // 副檔名或 MIME (例: .docx, .pdf, .png)

        public long FileSizeBytes { get; set; } = 0; // 檔案位元組大小

        [MaxLength(255)]
        public string? Description { get; set; } // 檔案備註說明

        public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
    }
}
