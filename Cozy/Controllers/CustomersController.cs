using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Cozy.Data;
using Cozy.Helpers;
using Cozy.Models;

namespace Cozy.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CustomersController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly ILogger<CustomersController> _logger;
        private readonly IWebHostEnvironment _env;

        public CustomersController(AppDbContext context, IWebHostEnvironment env, ILogger<CustomersController> logger)
        {
            _logger = logger;
            _context = context;
            _env = env;
        }

        // GET: api/Customers
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Customer>>> GetCustomers([FromQuery] string? search, [FromQuery] string? category)
        {
            var query = _context.Customers.AsQueryable();

            if (!string.IsNullOrWhiteSpace(category))
            {
                query = query.Where(c => c.Category == category);
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                search = search.Trim();
                query = query.Where(c => c.Name.Contains(search) || 
                                         c.Phone.Contains(search) || 
                                         (c.LineId != null && c.LineId.Contains(search)) ||
                                         (c.Address != null && c.Address.Contains(search)));
            }

            return await query.OrderByDescending(c => c.Id).ToListAsync();
        }

        // GET: api/Customers/5
        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetCustomer(int id)
        {
            var customer = await _context.Customers
                .Include(c => c.WorkLogs.OrderByDescending(w => w.ScheduledAt))
                .Include(c => c.Quotations.OrderByDescending(q => q.IssueDate))
                .Include(c => c.Payments.OrderByDescending(p => p.PaymentDate))
                .FirstOrDefaultAsync(c => c.Id == id);

            if (customer == null)
            {
                return NotFound(new { message = "找不到此客戶" });
            }

            return customer;
        }

        // POST: api/Customers
        [HttpPost]
        public async Task<ActionResult<Customer>> CreateCustomer([FromBody] Customer customer)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(customer.Name))
                {
                    return BadRequest(new { message = "客戶姓名為必填項目" });
                }
                if (string.IsNullOrWhiteSpace(customer.Phone))
                {
                    return BadRequest(new { message = "客戶電話為必填項目" });
                }

                if (string.IsNullOrWhiteSpace(customer.Category))
                {
                    customer.Category = "個人";
                }

                customer.CreatedAt = System.DateTime.UtcNow;
                _context.Customers.Add(customer);
                await _context.SaveChangesAsync();

                return CreatedAtAction(nameof(GetCustomer), new { id = customer.Id }, customer);
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "儲存客戶失敗");
                return StatusCode(500, new { message = "儲存客戶失敗，請稍後再試。" });
            }
        }

        // PUT: api/Customers/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateCustomer(int id, [FromBody] Customer customer)
        {
            try
            {
                if (id != customer.Id)
                {
                    return BadRequest(new { message = "ID 不符" });
                }

                if (string.IsNullOrWhiteSpace(customer.Name))
                {
                    return BadRequest(new { message = "客戶姓名為必填項目" });
                }
                if (string.IsNullOrWhiteSpace(customer.Phone))
                {
                    return BadRequest(new { message = "客戶電話為必填項目" });
                }

                var existing = await _context.Customers.FindAsync(id);
                if (existing == null)
                {
                    return NotFound(new { message = "找不到此客戶" });
                }

                existing.Name = customer.Name;
                existing.Phone = customer.Phone;
                existing.Category = string.IsNullOrWhiteSpace(customer.Category) ? "個人" : customer.Category;
                existing.LineId = customer.LineId;
                existing.Address = customer.Address;
                existing.Email = customer.Email;
                existing.Notes = customer.Notes;

                await _context.SaveChangesAsync();

                return Ok(existing);
            }
            catch (System.Exception ex)
            {
                _logger.LogError(ex, "更新客戶失敗");
                return StatusCode(500, new { message = "更新客戶失敗，請稍後再試。" });
            }
        }

        // DELETE: api/Customers/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteCustomer(int id)
        {
            var customer = await _context.Customers.FindAsync(id);
            if (customer == null)
            {
                return NotFound(new { message = "找不到此客戶" });
            }

            // 刪除客戶會連帶刪除其專案與附件紀錄（資料庫 Cascade），先收集實體檔案名稱以便清除硬碟檔案
            var storedFileNames = await _context.ProjectFiles
                .Where(f => f.Project != null && f.Project.CustomerId == id)
                .Select(f => f.StoredFileName)
                .ToListAsync();

            _context.Customers.Remove(customer);
            await _context.SaveChangesAsync();

            foreach (var storedName in storedFileNames)
            {
                ProjectFileStorage.DeletePhysicalFile(_env, storedName);
            }

            return Ok(new { message = "客戶已刪除" });
        }
    }
}
