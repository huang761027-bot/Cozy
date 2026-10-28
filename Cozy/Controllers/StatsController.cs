using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Cozy.Data;
using Cozy.Helpers;

namespace Cozy.Controllers
{
    // 統計報表：依台灣時間的月份彙整營收、工單、客戶與專案狀態
    [Route("api/[controller]")]
    [ApiController]
    public class StatsController : ControllerBase
    {
        private static readonly string[] WorkTypes = { "保養", "安裝", "維修", "其他" };

        // 營收的定義與總覽頁一致：狀態為「已收款」的收費紀錄
        private const string ReceivedStatus = "已收款";

        private readonly AppDbContext _context;

        public StatsController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/Stats?months=12   (近 N 個月，含本月)
        // GET: api/Stats?year=2026   (指定年度 1–12 月)
        [HttpGet]
        public async Task<IActionResult> GetStats([FromQuery] int? months, [FromQuery] int? year)
        {
            var taiwanNow = TaiwanTime.Now;
            DateTime firstMonth;
            int monthCount;

            if (year.HasValue && year.Value >= 2000 && year.Value <= taiwanNow.Year + 1)
            {
                firstMonth = new DateTime(year.Value, 1, 1);
                monthCount = 12;
            }
            else
            {
                monthCount = Math.Clamp(months ?? 12, 1, 36);
                firstMonth = new DateTime(taiwanNow.Year, taiwanNow.Month, 1).AddMonths(-(monthCount - 1));
            }

            var monthKeys = Enumerable.Range(0, monthCount).Select(i => firstMonth.AddMonths(i).ToString("yyyy-MM")).ToList();
            var monthIndex = monthKeys.Select((k, i) => (k, i)).ToDictionary(x => x.k, x => x.i);

            // 時間以 UTC 儲存；期間邊界以台灣時間的月初 00:00 換算成 UTC
            DateTime fromUtc = TaiwanTime.ToUtc(firstMonth);
            DateTime toUtc = TaiwanTime.ToUtc(firstMonth.AddMonths(monthCount));
            DateTime prevFromUtc = TaiwanTime.ToUtc(firstMonth.AddMonths(-monthCount));

            string MonthKey(DateTime utc) => (utc + TaiwanTime.Offset).ToString("yyyy-MM");

            // 只取需要的欄位，在記憶體中彙整（資料量為小型工作室規模，且相容 SQLite 與 MySQL）
            var payments = await _context.Payments
                .Where(p => p.PaymentDate >= prevFromUtc && p.PaymentDate < toUtc)
                .Select(p => new
                {
                    p.Amount,
                    p.PaymentDate,
                    p.Status,
                    p.PaymentMethod,
                    p.CustomerId,
                    CustomerName = p.Customer != null ? p.Customer.Name : null
                })
                .ToListAsync();

            var received = payments.Where(p => p.Status == ReceivedStatus && p.PaymentDate >= fromUtc).ToList();
            decimal prevRevenue = payments
                .Where(p => p.Status == ReceivedStatus && p.PaymentDate < fromUtc)
                .Sum(p => p.Amount);

            var revenueByMonth = new decimal[monthCount];
            var paymentCountByMonth = new int[monthCount];
            foreach (var p in received)
            {
                if (monthIndex.TryGetValue(MonthKey(p.PaymentDate), out int i))
                {
                    revenueByMonth[i] += p.Amount;
                    paymentCountByMonth[i]++;
                }
            }

            var paymentMethods = received
                .GroupBy(p => string.IsNullOrWhiteSpace(p.PaymentMethod) ? "未填寫" : p.PaymentMethod)
                .Select(g => new { method = g.Key, amount = g.Sum(p => p.Amount), count = g.Count() })
                .OrderByDescending(x => x.amount)
                .ToList();

            var topCustomers = received
                .GroupBy(p => p.CustomerId)
                .Select(g => new
                {
                    customerId = g.Key,
                    name = g.Key.HasValue ? (g.First().CustomerName ?? "未知客戶") : "散客 (現場購買)",
                    amount = g.Sum(p => p.Amount),
                    count = g.Count()
                })
                .OrderByDescending(x => x.amount)
                .Take(10)
                .ToList();

            // 待收款為目前所有未收的款項（不限期間）
            var pending = await _context.Payments
                .Where(p => p.Status == "待收款")
                .Select(p => p.Amount)
                .ToListAsync();

            var workLogs = await _context.WorkLogs
                .Where(w => w.ScheduledAt >= fromUtc && w.ScheduledAt < toUtc && w.Status != "已取消")
                .Select(w => new { w.ScheduledAt, w.WorkType, w.Status })
                .ToListAsync();

            var workOrdersByType = WorkTypes.ToDictionary(t => t, _ => new int[monthCount]);
            var completedByMonth = new int[monthCount];
            foreach (var w in workLogs)
            {
                if (!monthIndex.TryGetValue(MonthKey(w.ScheduledAt), out int i)) continue;
                string type = WorkTypes.Contains(w.WorkType) ? w.WorkType : "其他";
                workOrdersByType[type][i]++;
                if (w.Status == "已完成") completedByMonth[i]++;
            }

            var customerCreated = await _context.Customers
                .Where(c => c.CreatedAt >= fromUtc && c.CreatedAt < toUtc)
                .Select(c => c.CreatedAt)
                .ToListAsync();

            var newCustomersByMonth = new int[monthCount];
            foreach (var created in customerCreated)
            {
                if (monthIndex.TryGetValue(MonthKey(created), out int i)) newCustomersByMonth[i]++;
            }

            var projectStatus = (await _context.Projects.Select(p => p.Status).ToListAsync())
                .GroupBy(s => string.IsNullOrWhiteSpace(s) ? "未設定" : s)
                .Select(g => new { status = g.Key, count = g.Count() })
                .OrderByDescending(x => x.count)
                .ToList();

            decimal revenue = revenueByMonth.Sum();
            int paymentCount = paymentCountByMonth.Sum();

            return Ok(new
            {
                months = monthKeys,
                revenueByMonth,
                paymentCountByMonth,
                workTypes = WorkTypes,
                workOrdersByType,
                completedByMonth,
                newCustomersByMonth,
                paymentMethods,
                topCustomers,
                projectStatus,
                totals = new
                {
                    revenue,
                    prevRevenue,
                    paymentCount,
                    averageTicket = paymentCount > 0 ? Math.Round(revenue / paymentCount) : 0,
                    pendingAmount = pending.Sum(),
                    pendingCount = pending.Count,
                    workOrders = workLogs.Count,
                    completedWorkOrders = completedByMonth.Sum(),
                    newCustomers = newCustomersByMonth.Sum()
                }
            });
        }
    }
}
