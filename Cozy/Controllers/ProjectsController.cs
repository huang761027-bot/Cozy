using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.StaticFiles;
using Cozy.Data;
using Cozy.Models;

namespace Cozy.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ProjectsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IWebHostEnvironment _env;

        public ProjectsController(AppDbContext context, IWebHostEnvironment env)
        {
            _context = context;
            _env = env;
        }

        private string GetUploadDirectory()
        {
            // Support persistent volume on /app/data/uploads/projects if available, else wwwroot/uploads/projects
            string targetDir;
            if (Directory.Exists("/app/data"))
            {
                targetDir = Path.Combine("/app/data", "uploads", "projects");
            }
            else
            {
                string webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot");
                targetDir = Path.Combine(webRoot, "uploads", "projects");
            }

            if (!Directory.Exists(targetDir))
            {
                Directory.CreateDirectory(targetDir);
            }
            return targetDir;
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
                .Include(p => p.Files)
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
                    FileCount = p.Files.Count,
                    Files = p.Files.Select(f => new
                    {
                        f.Id,
                        f.FileName,
                        f.FileType,
                        f.FileSizeBytes,
                        f.Description,
                        f.UploadedAt,
                        f.FilePath
                    }).ToList()
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
                    string datePrefix = DateTime.Now.ToString("yyyyMMdd");
                    int countToday = await _context.Projects
                        .CountAsync(p => p.ProjectNumber.StartsWith("PRJ-" + datePrefix));
                    project.ProjectNumber = $"PRJ-{datePrefix}-{(countToday + 1):D2}";
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
                return StatusCode(500, new { message = "建立專案失敗: " + ex.Message });
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
                return StatusCode(500, new { message = "更新專案失敗: " + ex.Message });
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

            // Clean up files on disk
            string uploadDir = GetUploadDirectory();
            foreach (var file in project.Files)
            {
                try
                {
                    string filePath = Path.Combine(uploadDir, file.StoredFileName);
                    if (System.IO.File.Exists(filePath))
                    {
                        System.IO.File.Delete(filePath);
                    }
                }
                catch { }
            }

            _context.Projects.Remove(project);
            await _context.SaveChangesAsync();

            return Ok(new { message = "專案與相關檔案已刪除" });
        }

        // POST: api/Projects/5/files (Upload multiple files)
        [HttpPost("{id}/files")]
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

            string uploadDir = GetUploadDirectory();
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

            string uploadDir = GetUploadDirectory();
            try
            {
                string physicalPath = Path.Combine(uploadDir, file.StoredFileName);
                if (System.IO.File.Exists(physicalPath))
                {
                    System.IO.File.Delete(physicalPath);
                }
            }
            catch { }

            _context.ProjectFiles.Remove(file);
            await _context.SaveChangesAsync();

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

            string uploadDir = GetUploadDirectory();
            string physicalPath = Path.Combine(uploadDir, file.StoredFileName);

            if (!System.IO.File.Exists(physicalPath))
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

        // GET: api/Projects/files/download-by-name/{storedName}
        [HttpGet("files/download-by-name/{storedName}")]
        public async Task<IActionResult> DownloadFileByName(string storedName)
        {
            var file = await _context.ProjectFiles.FirstOrDefaultAsync(f => f.StoredFileName == storedName);
            string uploadDir = GetUploadDirectory();
            string physicalPath = Path.Combine(uploadDir, storedName);

            if (!System.IO.File.Exists(physicalPath))
            {
                return NotFound(new { message = "伺服器上找不到實體檔案" });
            }

            string downloadName = file != null ? file.FileName : storedName;
            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(downloadName, out string? contentType))
            {
                contentType = "application/octet-stream";
            }

            var stream = new FileStream(physicalPath, FileMode.Open, FileAccess.Read);
            return File(stream, contentType, downloadName, enableRangeProcessing: true);
        }
    }
}
