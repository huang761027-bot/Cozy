using System.IO;
using Microsoft.AspNetCore.Hosting;

namespace Cozy.Helpers
{
    // 專案附件的實體檔案存放位置（位於 wwwroot 之外，只能透過需登入的 API 下載）
    public static class ProjectFileStorage
    {
        public static string GetUploadDirectory(IWebHostEnvironment env)
        {
            // Use the persistent volume /app/data when available
            string baseDir = Directory.Exists("/app/data") ? "/app/data" : Path.Combine(env.ContentRootPath, "App_Data");
            string targetDir = Path.Combine(baseDir, "uploads", "projects");

            if (!Directory.Exists(targetDir))
            {
                Directory.CreateDirectory(targetDir);
            }
            return targetDir;
        }

        // 舊版本曾將檔案存放於 wwwroot/uploads/projects，讀取/刪除時一併相容
        public static string? ResolveExistingFilePath(IWebHostEnvironment env, string storedName)
        {
            string current = Path.Combine(GetUploadDirectory(env), storedName);
            if (File.Exists(current)) return current;

            string webRoot = env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot");
            string legacy = Path.Combine(webRoot, "uploads", "projects", storedName);
            return File.Exists(legacy) ? legacy : null;
        }

        // 啟動時將舊版存放於 wwwroot/uploads/projects 的檔案搬到新位置，避免被當成公開靜態檔案存取
        public static int MigrateLegacyUploads(IWebHostEnvironment env)
        {
            string webRoot = env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot");
            string legacyDir = Path.Combine(webRoot, "uploads", "projects");
            if (!Directory.Exists(legacyDir)) return 0;

            string targetDir = GetUploadDirectory(env);
            int moved = 0;
            foreach (string source in Directory.GetFiles(legacyDir))
            {
                string dest = Path.Combine(targetDir, Path.GetFileName(source));
                if (File.Exists(dest))
                {
                    File.Delete(source);
                }
                else
                {
                    File.Move(source, dest);
                }
                moved++;
            }
            return moved;
        }

        public static void DeletePhysicalFile(IWebHostEnvironment env, string storedName)
        {
            try
            {
                string? physicalPath = ResolveExistingFilePath(env, storedName);
                if (physicalPath != null)
                {
                    File.Delete(physicalPath);
                }
            }
            catch { }
        }
    }
}
