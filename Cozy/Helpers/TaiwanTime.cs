using System;

namespace Cozy.Helpers
{
    // 資料庫中的時間皆以 UTC 儲存；伺服器容器的時區也是 UTC，
    // 因此「本月」、專案編號日期等需要以台灣時間（UTC+8，無日光節約）計算的地方使用此類別。
    public static class TaiwanTime
    {
        public static readonly TimeSpan Offset = TimeSpan.FromHours(8);

        public static DateTime Now => DateTime.SpecifyKind(DateTime.UtcNow + Offset, DateTimeKind.Unspecified);

        // 將台灣當地時間轉成 UTC
        public static DateTime ToUtc(DateTime taiwanLocal) =>
            DateTime.SpecifyKind(taiwanLocal - Offset, DateTimeKind.Utc);
    }
}
