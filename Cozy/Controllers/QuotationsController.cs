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
    public class QuotationsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public QuotationsController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/Quotations
        [HttpGet]
        public async Task<ActionResult<IEnumerable<object>>> GetQuotations([FromQuery] int? customerId, [FromQuery] string? status, [FromQuery] string? search)
        {
            var query = _context.Quotations.Include(q => q.Customer).AsQueryable();

            if (customerId.HasValue)
            {
                query = query.Where(q => q.CustomerId == customerId.Value);
            }

            if (!string.IsNullOrWhiteSpace(status))
            {
                query = query.Where(q => q.Status == status);
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                search = search.Trim();
                query = query.Where(q => q.QuotationNumber.Contains(search) || 
                                         q.Title.Contains(search) ||
                                         (q.Customer != null && (q.Customer.Name.Contains(search) || q.Customer.Phone.Contains(search))));
            }

            var list = await query
                .OrderByDescending(q => q.IssueDate)
                .ThenByDescending(q => q.Id)
                .Select(q => new
                {
                    q.Id,
                    q.QuotationNumber,
                    q.CustomerId,
                    CustomerName = q.Customer != null ? q.Customer.Name : "",
                    CustomerPhone = q.Customer != null ? q.Customer.Phone : "",
                    CustomerCategory = q.Customer != null ? q.Customer.Category : "",
                    q.Title,
                    q.IssueDate,
                    q.ExpiryDate,
                    q.TotalAmount,
                    q.Status,
                    q.Notes,
                    q.CreatedAt,
                    HasPayment = _context.Payments.Any(p => p.QuotationId == q.Id)
                })
                .ToListAsync();

            return Ok(list);
        }

        // GET: api/Quotations/5
        [HttpGet("{id}")]
        public async Task<ActionResult<Quotation>> GetQuotation(int id)
        {
            var quotation = await _context.Quotations
                .Include(q => q.Customer)
                .Include(q => q.Items)
                .FirstOrDefaultAsync(q => q.Id == id);

            if (quotation == null)
            {
                return NotFound(new { message = "找不到此報價單" });
            }

            return quotation;
        }

        // POST: api/Quotations
        [HttpPost]
        public async Task<ActionResult<Quotation>> CreateQuotation([FromBody] Quotation quotation)
        {
            try
            {
                if (quotation.CustomerId <= 0)
                {
                    return BadRequest(new { message = "請選擇有效的關聯客戶" });
                }

                if (string.IsNullOrWhiteSpace(quotation.Title))
                {
                    return BadRequest(new { message = "報價單名稱為必填項目" });
                }

                if (string.IsNullOrWhiteSpace(quotation.QuotationNumber))
                {
                    // Auto generate quotation number like QT-20260904-001
                    string todayPrefix = $"QT-{DateTime.UtcNow:yyyyMMdd}";
                    int countToday = await _context.Quotations.CountAsync(q => q.QuotationNumber.StartsWith(todayPrefix));
                    quotation.QuotationNumber = $"{todayPrefix}-{(countToday + 1):D3}";
                }

                // Recalculate item subtotals and total amount
                decimal total = 0;
                if (quotation.Items != null)
                {
                    foreach (var item in quotation.Items)
                    {
                        item.Subtotal = item.Quantity * item.UnitPrice;
                        total += item.Subtotal;
                    }
                }
                quotation.TotalAmount = total;
                if (quotation.IssueDate == default)
                {
                    quotation.IssueDate = DateTime.UtcNow;
                }
                quotation.CreatedAt = DateTime.UtcNow;

                _context.Quotations.Add(quotation);
                await _context.SaveChangesAsync();

                return CreatedAtAction(nameof(GetQuotation), new { id = quotation.Id }, quotation);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "儲存報價單失敗: " + ex.Message });
            }
        }

        // POST: api/Quotations/5/to-payment (Convert quotation final amount to payment record)
        [HttpPost("{id}/to-payment")]
        public async Task<ActionResult<Payment>> ConvertToPayment(int id, [FromBody] ConvertPaymentDto? dto)
        {
            var quotation = await _context.Quotations.Include(q => q.Customer).FirstOrDefaultAsync(q => q.Id == id);
            if (quotation == null)
            {
                return NotFound(new { message = "找不到此報價單" });
            }

            var payment = new Payment
            {
                CustomerId = quotation.CustomerId,
                QuotationId = quotation.Id,
                Title = !string.IsNullOrWhiteSpace(dto?.Title) ? dto.Title : $"報價單結算: {quotation.Title} ({quotation.QuotationNumber})",
                Amount = quotation.TotalAmount,
                PaymentDate = dto?.PaymentDate ?? DateTime.UtcNow,
                PaymentMethod = !string.IsNullOrWhiteSpace(dto?.PaymentMethod) ? dto.PaymentMethod : "匯款",
                Status = !string.IsNullOrWhiteSpace(dto?.Status) ? dto.Status : "待收款",
                Notes = $"由報價單 {quotation.QuotationNumber} 轉入收費紀錄",
                CreatedAt = DateTime.UtcNow
            };

            _context.Payments.Add(payment);
            await _context.SaveChangesAsync();

            return Ok(payment);
        }

        // PUT: api/Quotations/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateQuotation(int id, [FromBody] Quotation quotation)
        {
            if (id != quotation.Id)
            {
                return BadRequest(new { message = "ID 不符" });
            }

            if (quotation.CustomerId <= 0)
            {
                return BadRequest(new { message = "請選擇有效的關聯客戶" });
            }

            if (string.IsNullOrWhiteSpace(quotation.Title))
            {
                return BadRequest(new { message = "報價單名稱為必填項目" });
            }

            var existing = await _context.Quotations
                .Include(q => q.Items)
                .FirstOrDefaultAsync(q => q.Id == id);

            if (existing == null)
            {
                return NotFound(new { message = "找不到此報價單" });
            }

            if (!string.IsNullOrWhiteSpace(quotation.QuotationNumber))
            {
                existing.QuotationNumber = quotation.QuotationNumber;
            }

            existing.CustomerId = quotation.CustomerId;
            existing.Title = quotation.Title;
            existing.IssueDate = quotation.IssueDate != default ? quotation.IssueDate : existing.IssueDate;
            existing.ExpiryDate = quotation.ExpiryDate;
            existing.Status = quotation.Status;
            existing.Notes = quotation.Notes;

            // Update items
            _context.QuotationItems.RemoveRange(existing.Items);
            existing.Items = quotation.Items ?? new List<QuotationItem>();

            decimal total = 0;
            foreach (var item in existing.Items)
            {
                item.Subtotal = item.Quantity * item.UnitPrice;
                total += item.Subtotal;
            }
            existing.TotalAmount = total;

            await _context.SaveChangesAsync();

            return Ok(existing);
        }

        // DELETE: api/Quotations/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteQuotation(int id)
        {
            var quotation = await _context.Quotations.FindAsync(id);
            if (quotation == null)
            {
                return NotFound(new { message = "找不到此報價單" });
            }

            _context.Quotations.Remove(quotation);
            await _context.SaveChangesAsync();

            return Ok(new { message = "報價單已刪除" });
        }
    }

    public class ConvertPaymentDto
    {
        public string? Title { get; set; }
        public DateTime? PaymentDate { get; set; }
        public string? PaymentMethod { get; set; }
        public string? Status { get; set; }
    }
}
