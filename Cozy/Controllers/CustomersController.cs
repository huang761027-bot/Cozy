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
    public class CustomersController : ControllerBase
    {
        private readonly AppDbContext _context;

        public CustomersController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/Customers
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Customer>>> GetCustomers([FromQuery] string? search)
        {
            var query = _context.Customers.AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                search = search.Trim();
                query = query.Where(c => c.Name.Contains(search) || 
                                         (c.Phone != null && c.Phone.Contains(search)) || 
                                         (c.LineId != null && c.LineId.Contains(search)));
            }

            return await query.OrderByDescending(c => c.Id).ToListAsync();
        }

        // GET: api/Customers/5
        [HttpGet("{id}")]
        public async Task<ActionResult<object>> GetCustomer(int id)
        {
            var customer = await _context.Customers
                .Include(c => c.WorkLogs.OrderByDescending(w => w.ScheduledAt).Take(10))
                .Include(c => c.Quotations.OrderByDescending(q => q.IssueDate).Take(10))
                .Include(c => c.Payments.OrderByDescending(p => p.PaymentDate).Take(10))
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
            if (string.IsNullOrWhiteSpace(customer.Name))
            {
                return BadRequest(new { message = "客戶姓名為必填項目" });
            }

            customer.CreatedAt = System.DateTime.UtcNow;
            _context.Customers.Add(customer);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetCustomer), new { id = customer.Id }, customer);
        }

        // PUT: api/Customers/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateCustomer(int id, [FromBody] Customer customer)
        {
            if (id != customer.Id)
            {
                return BadRequest(new { message = "ID 不符" });
            }

            var existing = await _context.Customers.FindAsync(id);
            if (existing == null)
            {
                return NotFound(new { message = "找不到此客戶" });
            }

            existing.Name = customer.Name;
            existing.Phone = customer.Phone;
            existing.LineId = customer.LineId;
            existing.Address = customer.Address;
            existing.Email = customer.Email;
            existing.Notes = customer.Notes;

            await _context.SaveChangesAsync();

            return Ok(existing);
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

            _context.Customers.Remove(customer);
            await _context.SaveChangesAsync();

            return Ok(new { message = "客戶已刪除" });
        }
    }
}
