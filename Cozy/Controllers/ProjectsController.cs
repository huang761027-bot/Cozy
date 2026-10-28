using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.StaticFiles;
using Cozy.Data;
using Cozy.Models;
using Cozy.Helpers;

namespace Cozy.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ProjectsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly ILogger<ProjectsController> _logger;
        private readonly IWebHostEnvironment _env;

        public ProjectsController(AppDbContext context, IWebHostEnvironment env, ILogger<ProjectsController> logger)
        {
            _logger = logger;
            _context = context;
            _env = env;
        }

        private const long MaxFileSizeBytes = 50L * 1024 * 1024;      // 單一檔案上限 50MB
        private const long MaxRequestSizeBytes = 200L * 1024 * 1024;  // 單次上傳總量上限 200MB

        // 禁止上傳可能在瀏覽器或伺服器上執行的檔案類型
        private static readonly HashSet<string> BlockedExtensions = new(StringComparer.OrdinalIgnoreCase)
        {
            ".html", ".htm", ".xhtml", ".shtml", ".svg", ".js", ".mjs", ".css", ".xml",
            ".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".ps1", ".sh", ".vbs", ".jar",
            ".php", ".asp", ".aspx", ".cshtml", ".config"
        };

        private IActionResult ServeFile(ProjectFile file)
        {
            string? physicalPath = ProjectFileStorage.ResolveExistingFilePath(_env, file.StoredFileName);
            if (physicalPath == null)
            {
                return NotFound(new { message = "伺服器上找不到實體檔案" });
            }

            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(file.FileName, out string? contentType))
            {
                contentType = "application/octet-stream";
            }

            var stream = new FileStream(physicalPath, FileMode.Open, FileAccess.Read);
            return File(stream, contentType, file.FileName, enableRangeProcessing: true);
        }

        // GET: api/Projects
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetProjects(
            [FromQuery] string? search,
            [FromQuery] int? customerId,
            [FromQuery] string? status)
        {
            var query = _context.Projects
                .Include(p => p.Customer)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                string s = search.Trim().ToLower();
                query = query.Where(p =>
                    p.ProjectNumber.ToLower().Contains(s) ||
                    p.Name.ToLower().Contains(s) ||
                    (p.Customer != null && p.Customer.Name.ToLower().Contains(s)) ||
                    (p.Address != null && p.Address.ToLower().Contains(s)) ||
                    (p.ContactPerson != null && p.ContactPerson.ToLower().Contains(s)) ||
                    (p.Notes != null && p.Notes.ToLower().Contains(s)));
            }

            if (customerId.HasValue && customerId.Value > 0)
            {
                query = query.Where(p => p.CustomerId == customerId.Value);
            }

            if (!string.IsNullOrWhiteSpace(status))
            {
                query = query.Where(p => p.Status == status.Trim());
            }

            var projects = await query
                .OrderByDescending(p => p.CreatedAt)
                .Select(p => new
                {
                    p.Id,
                    p.ProjectNumber,
                    p.Name,
                    p.CustomerId,
                    CustomerName = p.Customer != null ? p.Customer.Name : "未指定客戶",
                    CustomerPhone = p.Customer != null ? p.Customer.Phone : "",
                    CustomerCategory = p.Customer != null ? p.Customer.Category : "",
                    p.ContactPerson,
                    p.ContactPhone,
                    p.Address,
                    p.Budget,
                    p.Status,
                    p.StartDate,
                    p.EndDate,
                    p.Notes,
                    p.CreatedAt,
                    // 列表只需要檔案數量；檔案明細在 GET api/Projects/{id} 取得
                    FileCount = p.Files.Count
                })
                .ToListAsync();

            return Ok(projects);
        }

        // GET: api/Projects/5
        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetProject(int id)
        {
            var project = await _context.Projects
                .Include(p => p.Customer)
                .Include(p => p.Files)
                .Include(p => p.WorkLogs)
                .Include(p => p.Quotations)
                .Include(p => p.Payments)
                .FirstOrDefaultAsync(p => p.Id == id);

            if (project == null)
            {
                return NotFound(new { message = "找不到此專案/案場" });
            }

            return Ok(new
            {
                project.Id,
                project.ProjectNumber,
                project.Name,
                project.CustomerId,
                Customer = project.Customer,
                project.ContactPerson,
                project.ContactPhone,
                project.Address,
                project.Budget,
                project.Status,
                project.StartDate,
                project.EndDate,
                project.Notes,
                project.CreatedAt,
                Files = project.Files.OrderByDescending(f => f.UploadedAt).ToList(),
                WorkLogs = project.WorkLogs.OrderByDescending(w => w.ScheduledAt).ToList(),
                Quotations = project.Quotations.OrderByDescending(q => q.CreatedAt).ToList(),
                Payments = project.Payments.OrderByDescending(p => p.PaymentDate).ToList()
            });
        }

        // POST: api/Projects
        [HttpPost]
        public async Task<ActionResult<Project>> CreateProject([FromBody] Project project)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(project.Name))
                {
                    return BadRequest(new { message = "專案/案場名稱為必填項目" });
                }

                if (project.CustomerId <= 0)
                {
                    return BadRequest(new { message = "請選擇關聯客戶/設計師/公司" });
                }

                // Auto generate project number if empty
                if (string.IsNullOrWhiteSpace(project.ProjectNumber))
                {
                    // 以今日已存在的最大流水號 + 1 產生編號（刪除專案後不會重複）
                    string prefix = $"PRJ-{TaiwanTime.Now:yyyyMMdd}-";
                    var todayNumbers = await _context.Projects
                        .Where(p => p.ProjectNumber.StartsWith(prefix))
                        .Select(p => p.ProjectNumber)
                        .ToListAsync();
                    int maxSeq = todayNumbers
                        .Select(n => int.TryParse(n.Substring(prefix.Length), out int seq) ? seq : 0)
                        .DefaultIfEmpty(0)
                        .Max();
                    project.ProjectNumber = $"{prefix}{(maxSeq + 1):D2}";
                }

                if (string.IsNullOrWhiteSpace(project.Status))
                {
                    project.Status = "進行中";
                }

                project.CreatedAt = DateTime.UtcNow;
                _context.Projects.Add(project);
                await _context.SaveChangesAsync();

                return CreatedAtAction(nameof(GetProject), new { id = project.Id }, project);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "建立專案失敗");
                return StatusCode(500, new { message = "建立專案失敗，請稍後再試。" });
            }
        }

        // PUT: api/Projects/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateProject(int id, [FromBody] Project project)
        {
            try
            {
                if (id != project.Id)
                {
                    return BadRequest(new { message = "ID 不符" });
                }

                if (string.IsNullOrWhiteSpace(project.Name))
                {
                    return BadRequest(new { message = "專案/案場名稱為必填項目" });
                }

                if (project.CustomerId <= 0)
                {
                    return BadRequest(new { message = "請選擇關聯客戶/設計師/公司" });
                }

                var existing = await _context.Projects.FindAsync(id);
                if (existing == null)
                {
                    return NotFound(new { message = "找不到此專案/案場" });
                }

                existing.ProjectNumber = !string.IsNullOrWhiteSpace(project.ProjectNumber) ? project.ProjectNumber : existing.ProjectNumber;
                existing.Name = project.Name;
                existing.CustomerId = project.CustomerId;
                existing.ContactPerson = project.ContactPerson;
                existing.ContactPhone = project.ContactPhone;
                existing.Address = project.Address;
                existing.Budget = project.Budget;
                existing.Status = !string.IsNullOrWhiteSpace(project.Status) ? project.Status : existing.Status;
                existing.StartDate = project.StartDate;
                existing.EndDate = project.EndDate;
                existing.Notes = project.Notes;

                await _context.SaveChangesAsync();
                return Ok(existing);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "更新專案失敗");
                return StatusCode(500, new { message = "更新專案失敗，請稍後再試。" });
            }
        }

        // DELETE: api/Projects/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteProject(int id)
        {
            var project = await _context.Projects
                .Include(p => p.Files)
                .FirstOrDefaultAsync(p => p.Id == id);

            if (project == null)
            {
                return NotFound(new { message = "找不到此專案/案場" });
            }

            var storedFileNames = project.Files.Select(f => f.StoredFileName).ToList();

            _context.Projects.Remove(project);
            await _context.SaveChangesAsync();

            // Clean up files on disk only after the database delete succeeded
            foreach (var storedName in storedFileNames)
            {
                ProjectFileStorage.DeletePhysicalFile(_env, storedName);
            }

            return Ok(new { message = "專案與相關檔案已刪除" });
        }

        // POST: api/Projects/5/files (Upload multiple files)
        [HttpPost("{id}/files")]
        [RequestSizeLimit(MaxRequestSizeBytes)]
        [RequestFormLimits(MultipartBodyLengthLimit = MaxRequestSizeBytes)]
        public async Task<IActionResult> UploadFiles(int id, [FromForm] IFormFileCollection files, [FromForm] string? description)
        {
            var project = await _context.Projects.FindAsync(id);
            if (project == null)
            {
                return NotFound(new { message = "找不到指定的專案" });
            }

            if (files == null || files.Count == 0)
            {
                return BadRequest(new { message = "請選擇要上傳的檔案" });
            }

            foreach (var file in files)
            {
                if (file.Length > MaxFileSizeBytes)
                {
                    return BadRequest(new { message = $"檔案「{Path.GetFileName(file.FileName)}」超過 50MB 上限" });
                }
                if (BlockedExtensions.Contains(Path.GetExtension(file.FileName)))
                {
                    return BadRequest(new { message = $"基於安全考量，不允許上傳「{Path.GetExtension(file.FileName)}」類型的檔案" });
                }
            }

            string uploadDir = ProjectFileStorage.GetUploadDirectory(_env);
            var addedFiles = new List<ProjectFile>();

            foreach (var file in files)
            {
                if (file.Length == 0) continue;

                string origName = Path.GetFileName(file.FileName);
                string ext = Path.GetExtension(origName).ToLower();
                string storedName = $"{Guid.NewGuid():N}_{origName}";
                string physicalPath = Path.Combine(uploadDir, storedName);

                using (var stream = new FileStream(physicalPath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                var projectFile = new ProjectFile
                {
                    ProjectId = id,
                    FileName = origName,
                    StoredFileName = storedName,
                    FilePath = $"/api/projects/files/download-by-name/{storedName}",
                    FileType = ext,
                    FileSizeBytes = file.Length,
                    Description = description,
                    UploadedAt = DateTime.UtcNow
                };

                _context.ProjectFiles.Add(projectFile);
                addedFiles.Add(projectFile);
            }

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = $"成功上傳 {addedFiles.Count} 個檔案",
                files = addedFiles
            });
        }

        // DELETE: api/Projects/files/10
        [HttpDelete("files/{fileId}")]
        public async Task<IActionResult> DeleteFile(int fileId)
        {
            var file = await _context.ProjectFiles.FindAsync(fileId);
            if (file == null)
            {
                return NotFound(new { message = "找不到此檔案" });
            }

            _context.ProjectFiles.Remove(file);
            await _context.SaveChangesAsync();

            ProjectFileStorage.DeletePhysicalFile(_env, file.StoredFileName);

            return Ok(new { message = "檔案已刪除" });
        }

        // GET: api/Projects/files/{fileId}/download
        [HttpGet("files/{fileId}/download")]
        public async Task<IActionResult> DownloadFile(int fileId)
        {
            var file = await _context.ProjectFiles.FindAsync(fileId);
            if (file == null)
            {
                return NotFound(new { message = "找不到此檔案" });
            }

            return ServeFile(file);
        }

        // GET: api/Projects/files/download-by-name/{storedName}
        [HttpGet("files/download-by-name/{storedName}")]
        public async Task<IActionResult> DownloadFileByName(string storedName)
        {
            // Only serve files that are registered in the database (prevents arbitrary path access)
            var file = await _context.ProjectFiles.FirstOrDefaultAsync(f => f.StoredFileName == storedName);
            if (file == null)
            {
                return NotFound(new { message = "找不到此檔案" });
            }

            return ServeFile(file);
        }
    }
}
