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
    public class PaymentsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public PaymentsController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/Payments
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetPayments(
            [FromQuery] int? customerId,
            [FromQuery] string? status,
            [FromQuery] string? month,
            [FromQuery] string? search)
        {
            var query = _context.Payments
                .Include(p => p.Customer)
                .Include(p => p.Quotation)
                .AsQueryable();

            if (customerId.HasValue)
            {
                query = query.Where(p => p.CustomerId == customerId.Value);
            }

            if (!string.IsNullOrWhiteSpace(status))
            {
                query = query.Where(p => p.Status == status);
            }

            if (!string.IsNullOrWhiteSpace(month) && month.Length == 7) // "2026-09"
            {
                if (int.TryParse(month.Substring(0, 4), out int year) &&
                    int.TryParse(month.Substring(5, 2), out int m))
                {
                    query = query.Where(p => p.PaymentDate.Year == year && p.PaymentDate.Month == m);
                }
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                search = search.Trim();
                query = query.Where(p => p.Title.Contains(search) || 
                                         (p.Customer != null && p.Customer.Name.Contains(search)) ||
                                         (p.Notes != null && p.Notes.Contains(search)) ||
                                         (p.InvoiceNumber != null && p.InvoiceNumber.Contains(search)));
            }

            var list = await query
                .OrderByDescending(p => p.PaymentDate)
                .Select(p => new
                {
                    p.Id,
                    p.CustomerId,
                    CustomerName = p.Customer != null ? p.Customer.Name : "散客 (現場購買)",
                    CustomerPhone = p.Customer != null ? p.Customer.Phone : null,
                    CustomerCategory = p.Customer != null ? p.Customer.Category : null,
                    p.QuotationId,
                    QuotationNumber = p.Quotation != null ? p.Quotation.QuotationNumber : null,
                    p.Title,
                    p.Amount,
                    p.PaymentDate,
                    p.PaymentMethod,
                    p.Status,
                    p.InvoiceNumber,
                    p.Notes,
                    p.CreatedAt
                })
                .ToListAsync();

            return Ok(list);
        }

        // GET: api/Payments/5
        [HttpGet("{id}")]
        public async Task<ActionResult<Payment>> GetPayment(int id)
        {
            var payment = await _context.Payments
                .Include(p => p.Customer)
                .Include(p => p.Quotation)
                .FirstOrDefaultAsync(p => p.Id == id);

            if (payment == null)
            {
                return NotFound(new { message = "找不到此收費記錄" });
            }

            return payment;
        }

        // POST: api/Payments
        [HttpPost]
        public async Task<ActionResult<Payment>> CreatePayment([FromBody] Payment payment)
        {
            if (string.IsNullOrWhiteSpace(payment.Title))
            {
                return BadRequest(new { message = "收費項目說明為必填項目" });
            }

            // If customerId is 0 or not found, set to null (anonymous customer)
            if (payment.CustomerId.HasValue && payment.CustomerId.Value <= 0)
            {
                payment.CustomerId = null;
            }

            payment.CreatedAt = DateTime.UtcNow;
            _context.Payments.Add(payment);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetPayment), new { id = payment.Id }, payment);
        }

        // PUT: api/Payments/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdatePayment(int id, [FromBody] Payment payment)
        {
            if (id != payment.Id)
            {
                return BadRequest(new { message = "ID 不符" });
            }

            var existing = await _context.Payments.FindAsync(id);
            if (existing == null)
            {
                return NotFound(new { message = "找不到此收費記錄" });
            }

            existing.CustomerId = (payment.CustomerId.HasValue && payment.CustomerId.Value > 0) ? payment.CustomerId : null;
            existing.QuotationId = payment.QuotationId;
            existing.Title = payment.Title;
            existing.Amount = payment.Amount;
            existing.PaymentDate = payment.PaymentDate;
            existing.PaymentMethod = payment.PaymentMethod;
            existing.Status = payment.Status;
            existing.InvoiceNumber = payment.InvoiceNumber;
            existing.Notes = payment.Notes;

            await _context.SaveChangesAsync();

            return Ok(existing);
        }

        // DELETE: api/Payments/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeletePayment(int id)
        {
            var payment = await _context.Payments.FindAsync(id);
            if (payment == null)
            {
                return NotFound(new { message = "找不到此收費記錄" });
            }

            _context.Payments.Remove(payment);
            await _context.SaveChangesAsync();

            return Ok(new { message = "收費記錄已刪除" });
        }
    }
}
