using System;

namespace Cozy.Helpers
{
    // 資料庫中的日期時間皆以台灣當地時間（UTC+8，無日光節約）儲存，
    // 伺服器容器的時區為 UTC，因此「今天」、「本月」等判斷需以台灣時間計算。
    public static class TaiwanTime
    {
        public static readonly TimeSpan Offset = TimeSpan.FromHours(8);

        public static DateTime Now => DateTime.SpecifyKind(DateTime.UtcNow + Offset, DateTimeKind.Unspecified);

        public static DateTime Today => Now.Date;

        // 將台灣當地時間轉成 UTC
        public static DateTime ToUtc(DateTime taiwanLocal) =>
            DateTime.SpecifyKind(taiwanLocal - Offset, DateTimeKind.Utc);
    }
}
