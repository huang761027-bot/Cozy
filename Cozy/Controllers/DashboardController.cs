using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Cozy.Data;
using Cozy.Helpers;

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
            var now = TaiwanTime.Now; // 以台灣時間計算本月起始日
            var today = now.Date;
            var firstDayOfMonth = new DateTime(now.Year, now.Month, 1);

            var totalCustomers = await _context.Customers.CountAsync();

            // 尚未完成的工程 (進行中, 待進場, 暫停 等，排除已完工與已結案) 依照日期排序
            var pendingProjects = await _context.Projects
                .Include(p => p.Customer)
                .Where(p => p.Status != "已完工" && p.Status != "已結案")
                .OrderBy(p => p.EndDate ?? p.StartDate ?? p.CreatedAt)
                .Select(p => new
                {
                    p.Id,
                    p.ProjectNumber,
                    p.Name,
                    p.Status,
                    p.Budget,
                    p.StartDate,
                    p.EndDate,
                    p.Address,
                    p.ContactPerson,
                    p.ContactPhone,
                    p.CreatedAt,
                    CustomerName = p.Customer != null ? p.Customer.Name : "未指定客戶",
                    CustomerPhone = p.Customer != null ? p.Customer.Phone : ""
                })
                .ToListAsync();

            var pendingProjectsCount = pendingProjects.Count;

            // 尚未完成/待辦之工作行程 (保養、安裝、維修等，排除已完成與已取消) 依日期排序
            var pendingWorkLogs = await _context.WorkLogs
                .Include(w => w.Customer)
                .Include(w => w.Project)
                .Where(w => w.Status != "已完成" && w.Status != "已取消")
                .OrderByDescending(w => w.IsPriority)
                .ThenBy(w => w.ScheduledAt)
                .Take(25)
                .Select(w => new
                {
                    w.Id,
                    w.WorkType,
                    w.Title,
                    w.ScheduledAt,
                    w.Status,
                    w.StatusUpdatedAt,
                    w.IsPriority,
                    w.Location,
                    CustomerName = w.Customer != null ? w.Customer.Name : "未指定客戶",
                    CustomerPhone = w.Customer != null ? w.Customer.Phone : "",
                    ProjectName = w.Project != null ? w.Project.Name : null
                })
                .ToListAsync();

            var pendingWorkLogsCount = pendingWorkLogs.Count;

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
                pendingProjectsCount,
                pendingWorkLogsCount,
                monthRevenue,
                pendingPaymentsAmount,
                pendingPaymentsCount,
                pendingProjects,
                pendingWorkLogs,
                recentPayments
            });
        }
    }
}
