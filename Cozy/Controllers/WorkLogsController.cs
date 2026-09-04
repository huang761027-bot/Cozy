using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Cozy.Data;
using Cozy.Models;

namespace Cozy.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class WorkLogsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public WorkLogsController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/WorkLogs
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetWorkLogs(
            [FromQuery] int? customerId,
            [FromQuery] string? status,
            [FromQuery] DateTime? date,
            [FromQuery] string? search)
        {
            var query = _context.WorkLogs.Include(w => w.Customer).AsQueryable();

            if (customerId.HasValue)
            {
                query = query.Where(w => w.CustomerId == customerId.Value);
            }

            if (!string.IsNullOrWhiteSpace(status))
            {
                query = query.Where(w => w.Status == status);
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
                                         (w.Details != null && w.Details.Contains(search)) ||
                                         (w.Location != null && w.Location.Contains(search)) ||
                                         (w.Customer != null && (w.Customer.Name.Contains(search) || w.Customer.Phone.Contains(search))));
            }

            var list = await query
                .OrderByDescending(w => w.IsPriority)
                .ThenByDescending(w => w.ScheduledAt)
                .Select(w => new
                {
                    w.Id,
                    w.CustomerId,
                    CustomerName = w.Customer != null ? w.Customer.Name : "未指定客戶",
                    CustomerPhone = w.Customer != null ? w.Customer.Phone : null,
                    CustomerCategory = w.Customer != null ? w.Customer.Category : null,
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
                return StatusCode(500, new { message = "儲存工作記錄失敗: " + ex.Message });
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
                return StatusCode(500, new { message = "更新狀態失敗: " + ex.Message });
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
                return StatusCode(500, new { message = "更新工作記錄失敗: " + ex.Message });
            }
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
