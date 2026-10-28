using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Cozy.Data;
using Cozy.Models;

namespace Cozy.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class WorkLogsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly ILogger<WorkLogsController> _logger;

        public WorkLogsController(AppDbContext context, ILogger<WorkLogsController> logger)
        {
            _logger = logger;
            _context = context;
        }

        // GET: api/WorkLogs
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetWorkLogs(
            [FromQuery] int? customerId,
            [FromQuery] int? projectId,
            [FromQuery] string? workType,
            [FromQuery] string? status,
            [FromQuery] bool? hideCompleted,
            [FromQuery] bool? showAll,
            [FromQuery] DateTime? date,
            [FromQuery] string? search)
        {
            var query = _context.WorkLogs
                .Include(w => w.Customer)
                .Include(w => w.Project)
                .AsQueryable();

            if (customerId.HasValue)
            {
                query = query.Where(w => w.CustomerId == customerId.Value);
            }

            if (projectId.HasValue)
            {
                query = query.Where(w => w.ProjectId == projectId.Value);
            }

            if (!string.IsNullOrWhiteSpace(workType))
            {
                query = query.Where(w => w.WorkType == workType.Trim());
            }

            if (!string.IsNullOrWhiteSpace(status))
            {
                query = query.Where(w => w.Status == status.Trim());
            }
            else if (showAll != true && hideCompleted != false)
            {
                // 預設排除已完成與已取消 (取消與完成就不顯示)
                query = query.Where(w => w.Status != "已完成" && w.Status != "已取消");
            }

            if (date.HasValue)
            {
                var targetDate = date.Value.Date;
                query = query.Where(w => w.ScheduledAt.Date == targetDate);
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                search = search.Trim();
                query = query.Where(w => w.Title.Contains(search) || 
                                         (w.WorkType != null && w.WorkType.Contains(search)) ||
                                         (w.Details != null && w.Details.Contains(search)) ||
                                         (w.Location != null && w.Location.Contains(search)) ||
                                         (w.Project != null && w.Project.Name.Contains(search)) ||
                                         (w.Customer != null && (w.Customer.Name.Contains(search) || w.Customer.Phone.Contains(search))));
            }

            var list = await query
                .OrderByDescending(w => w.IsPriority)
                .ThenBy(w => w.ScheduledAt)
                .Select(w => new
                {
                    w.Id,
                    w.CustomerId,
                    CustomerName = w.Customer != null ? w.Customer.Name : "未指定客戶",
                    CustomerPhone = w.Customer != null ? w.Customer.Phone : null,
                    CustomerCategory = w.Customer != null ? w.Customer.Category : null,
                    w.ProjectId,
                    ProjectName = w.Project != null ? w.Project.Name : null,
                    w.WorkType,
                    w.Title,
                    w.ScheduledAt,
                    w.Status,
                    w.StatusUpdatedAt,
                    w.IsPriority,
                    w.Details,
                    w.Location,
                    w.CreatedAt
                })
                .ToListAsync();

            return Ok(list);
        }

        // GET: api/WorkLogs/customer/{customerId} (完整取得某客戶之保養/安裝/維修所有歷史紀錄)
        [HttpGet("customer/{customerId}")]
        public async Task<ActionResult<IEnumerable<object>>> GetCustomerHistory(int customerId)
        {
            var list = await _context.WorkLogs
                .Include(w => w.Customer)
                .Include(w => w.Project)
                .Where(w => w.CustomerId == customerId)
                .OrderByDescending(w => w.ScheduledAt)
                .Select(w => new
                {
                    w.Id,
                    w.CustomerId,
                    CustomerName = w.Customer != null ? w.Customer.Name : "未指定客戶",
                    CustomerPhone = w.Customer != null ? w.Customer.Phone : null,
                    w.ProjectId,
                    ProjectName = w.Project != null ? w.Project.Name : null,
                    w.WorkType,
                    w.Title,
                    w.ScheduledAt,
                    w.Status,
                    w.StatusUpdatedAt,
                    w.IsPriority,
                    w.Details,
                    w.Location,
                    w.CreatedAt
                })
                .ToListAsync();

            return Ok(list);
        }

        // GET: api/WorkLogs/5
        [HttpGet("{id}")]
        public async Task<ActionResult<WorkLog>> GetWorkLog(int id)
        {
            var workLog = await _context.WorkLogs
                .Include(w => w.Customer)
                .Include(w => w.Project)
                .FirstOrDefaultAsync(w => w.Id == id);

            if (workLog == null)
            {
                return NotFound(new { message = "找不到此工作記錄" });
            }

            return workLog;
        }

        // POST: api/WorkLogs
        [HttpPost]
        public async Task<ActionResult<WorkLog>> CreateWorkLog([FromBody] WorkLog workLog)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(workLog.Title))
                {
                    return BadRequest(new { message = "工作標題為必填項目" });
                }

                if (string.IsNullOrWhiteSpace(workLog.WorkType))
                {
                    workLog.WorkType = "保養";
                }

                if (workLog.ScheduledAt == default)
                {
                    workLog.ScheduledAt = DateTime.UtcNow;
                }

                // 預設狀態為待處理
                if (string.IsNullOrWhiteSpace(workLog.Status))
                {
                    workLog.Status = "待處理";
                }
                workLog.StatusUpdatedAt = DateTime.UtcNow;
                workLog.CreatedAt = DateTime.UtcNow;

                _context.WorkLogs.Add(workLog);
                await _context.SaveChangesAsync();

                return CreatedAtAction(nameof(GetWorkLog), new { id = workLog.Id }, workLog);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "儲存工作記錄失敗");
                return StatusCode(500, new { message = "儲存工作記錄失敗，請稍後再試。" });
            }
        }

        // PATCH: api/WorkLogs/5/status
        [HttpPatch("{id}/status")]
        public async Task<IActionResult> UpdateStatus(int id, [FromBody] StatusUpdateDto dto)
        {
            try
            {
                var existing = await _context.WorkLogs.FindAsync(id);
                if (existing == null)
                {
                    return NotFound(new { message = "找不到此工作記錄" });
                }

                if (!string.IsNullOrWhiteSpace(dto.Status))
                {
                    existing.Status = dto.Status;
                    existing.StatusUpdatedAt = DateTime.UtcNow;
                    await _context.SaveChangesAsync();
                }

                return Ok(existing);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "更新狀態失敗");
                return StatusCode(500, new { message = "更新狀態失敗，請稍後再試。" });
            }
        }

        // PUT: api/WorkLogs/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateWorkLog(int id, [FromBody] WorkLog workLog)
        {
            try
            {
                if (id != workLog.Id)
                {
                    return BadRequest(new { message = "ID 不符" });
                }

                if (string.IsNullOrWhiteSpace(workLog.Title))
                {
                    return BadRequest(new { message = "工作標題為必填項目" });
                }

                var existing = await _context.WorkLogs.FindAsync(id);
                if (existing == null)
                {
                    return NotFound(new { message = "找不到此工作記錄" });
                }

                if (existing.Status != workLog.Status)
                {
                    existing.StatusUpdatedAt = DateTime.UtcNow;
                }

                existing.CustomerId = workLog.CustomerId;
                existing.ProjectId = workLog.ProjectId;
                existing.WorkType = string.IsNullOrWhiteSpace(workLog.WorkType) ? "保養" : workLog.WorkType;
                existing.Title = workLog.Title;
                existing.ScheduledAt = workLog.ScheduledAt != default ? workLog.ScheduledAt : existing.ScheduledAt;
                existing.Status = string.IsNullOrWhiteSpace(workLog.Status) ? "待處理" : workLog.Status;
                existing.IsPriority = workLog.IsPriority;
                existing.Details = workLog.Details;
                existing.Location = workLog.Location;

                await _context.SaveChangesAsync();

                return Ok(existing);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "更新工作記錄失敗");
                return StatusCode(500, new { message = "更新工作記錄失敗，請稍後再試。" });
            }
        }

        // GET: api/WorkLogs/calendar.ics
        [HttpGet("calendar.ics")]
        public async Task<IActionResult> GetCalendarIcs()
        {
            var workLogs = await _context.WorkLogs
                .Include(w => w.Customer)
                .Where(w => w.Status != "已取消")
                .OrderByDescending(w => w.ScheduledAt)
                .Take(200)
                .ToListAsync();

            var sb = new System.Text.StringBuilder();
            sb.AppendLine("BEGIN:VCALENDAR");
            sb.AppendLine("VERSION:2.0");
            sb.AppendLine("PRODID:-//Cozy//Yongcang Work Schedule//TW");
            sb.AppendLine("CALSCALE:GREGORIAN");
            sb.AppendLine("METHOD:PUBLISH");
            sb.AppendLine("X-WR-CALNAME:永倉工作行程");
            sb.AppendLine("X-WR-TIMEZONE:Asia/Taipei");

            foreach (var w in workLogs)
            {
                var start = w.ScheduledAt;
                var end = start.AddHours(2);
                string custName = w.Customer != null ? w.Customer.Name : "未指定客戶";
                string title = $"【永倉】{w.Title} - {custName}";
                string loc = w.Location ?? (w.Customer != null ? w.Customer.Address : "") ?? "";
                string desc = $"狀態: {w.Status}\n客戶電話: {(w.Customer?.Phone ?? "無")}\n工作說明: {w.Details ?? "無"}";

                sb.AppendLine("BEGIN:VEVENT");
                sb.AppendLine($"UID:worklog-{w.Id}@cozy-system");
                sb.AppendLine($"DTSTAMP:{DateTime.UtcNow:yyyyMMdd\\THHmmss\\Z}");
                // ScheduledAt is stored in UTC (frontend sends toISOString())
                sb.AppendLine($"DTSTART:{start:yyyyMMdd\\THHmmss\\Z}");
                sb.AppendLine($"DTEND:{end:yyyyMMdd\\THHmmss\\Z}");
                sb.AppendLine(IcsFold($"SUMMARY:{IcsEscape(title)}"));
                sb.AppendLine(IcsFold($"LOCATION:{IcsEscape(loc)}"));
                sb.AppendLine(IcsFold($"DESCRIPTION:{IcsEscape(desc)}"));
                sb.AppendLine("STATUS:CONFIRMED");
                sb.AppendLine("END:VEVENT");
            }

            sb.AppendLine("END:VCALENDAR");

            // iCalendar (RFC 5545) requires CRLF line endings
            byte[] icsBytes = System.Text.Encoding.UTF8.GetBytes(sb.ToString().Replace("\r\n", "\n").Replace("\n", "\r\n"));
            return File(icsBytes, "text/calendar", "cozy_work_schedule.ics");
        }

        // Escape text values per RFC 5545 (backslash, semicolon, comma, newline)
        private static string IcsEscape(string value) =>
            value.Replace("\\", "\\\\")
                 .Replace(";", "\\;")
                 .Replace(",", "\\,")
                 .Replace("\r\n", "\\n")
                 .Replace("\r", "\\n")
                 .Replace("\n", "\\n");

        // Fold content lines longer than 75 octets (RFC 5545 §3.1) without splitting UTF-8 characters
        private static string IcsFold(string line)
        {
            var sb = new System.Text.StringBuilder();
            int octets = 0;
            foreach (var rune in line.EnumerateRunes())
            {
                int len = rune.Utf8SequenceLength;
                if (octets + len > 75)
                {
                    sb.Append("\n ");
                    octets = 1; // leading space counts toward the next line
                }
                sb.Append(rune.ToString());
                octets += len;
            }
            return sb.ToString();
        }

        // DELETE: api/WorkLogs/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteWorkLog(int id)
        {
            var workLog = await _context.WorkLogs.FindAsync(id);
            if (workLog == null)
            {
                return NotFound(new { message = "找不到此工作記錄" });
            }

            _context.WorkLogs.Remove(workLog);
            await _context.SaveChangesAsync();

            return Ok(new { message = "工作記錄已刪除" });
        }
    }

    public class StatusUpdateDto
    {
        public string Status { get; set; } = string.Empty;
    }
}
