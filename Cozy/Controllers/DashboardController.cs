using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Cozy.Data;

namespace Cozy.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class DashboardController : ControllerBase
    {
        private readonly AppDbContext _context;

        public DashboardController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet("stats")]
        public async Task<ActionResult<object>> GetDashboardStats()
        {
            var now = DateTime.UtcNow;
            var today = now.Date;
            var firstDayOfMonth = new DateTime(now.Year, now.Month, 1);

            var totalCustomers = await _context.Customers.CountAsync();
            
            var todayWorkLogs = await _context.WorkLogs
                .Include(w => w.Customer)
                .Where(w => w.ScheduledAt.Date == today)
                .OrderBy(w => w.ScheduledAt)
                .Select(w => new
                {
                    w.Id,
                    w.Title,
                    w.ScheduledAt,
                    w.Status,
                    CustomerName = w.Customer != null ? w.Customer.Name : "未指定客戶"
                })
                .ToListAsync();

            var pendingWorkLogsCount = await _context.WorkLogs
                .CountAsync(w => w.Status == "待處理" || w.Status == "進行中");

            var monthRevenue = await _context.Payments
                .Where(p => p.PaymentDate >= firstDayOfMonth && p.Status == "已收款")
                .SumAsync(p => (decimal?)p.Amount) ?? 0;

            var pendingPaymentsAmount = await _context.Payments
                .Where(p => p.Status == "待收款")
                .SumAsync(p => (decimal?)p.Amount) ?? 0;

            var pendingPaymentsCount = await _context.Payments
                .CountAsync(p => p.Status == "待收款");

            var recentPayments = await _context.Payments
                .Include(p => p.Customer)
                .OrderByDescending(p => p.PaymentDate)
                .Take(5)
                .Select(p => new
                {
                    p.Id,
                    p.Title,
                    p.Amount,
                    p.PaymentDate,
                    p.Status,
                    CustomerName = p.Customer != null ? p.Customer.Name : "未指定"
                })
                .ToListAsync();

            return Ok(new
            {
                totalCustomers,
                pendingWorkLogsCount,
                monthRevenue,
                pendingPaymentsAmount,
                pendingPaymentsCount,
                todayWorkLogs,
                recentPayments
            });
        }
    }
}
