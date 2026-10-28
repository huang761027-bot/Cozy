using System;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Cozy.Data;
using Cozy.Helpers;
using Cozy.Security;

var builder = WebApplication.CreateBuilder(args);

// 1. Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

// 2. Intelligent Database Configuration (MySQL on Railway / SQLite for smooth local development)
string? railwayUrl = Environment.GetEnvironmentVariable("MYSQL_URL") 
    ?? Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? Environment.GetEnvironmentVariable("MYSQLHOST");

string connectionString = DbConnectionStringHelper.GetMySQLConnectionString(builder.Configuration);

// Check if we should use MySQL (Railway environment OR non-localhost custom string)
bool isLocalhostDefault = connectionString.Contains("Server=localhost", StringComparison.OrdinalIgnoreCase);
bool useMySql = !string.IsNullOrWhiteSpace(railwayUrl) || (!isLocalhostDefault);

builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (useMySql)
    {
        var serverVersion = new MySqlServerVersion(new Version(8, 0, 36));
        options.UseMySql(connectionString, serverVersion, mySqlOptions =>
        {
            mySqlOptions.EnableRetryOnFailure(
                maxRetryCount: 3,
                maxRetryDelay: TimeSpan.FromSeconds(5),
                errorNumbersToAdd: null);
        });
    }
    else
    {
        // Local fallback: SQLite (Runs immediately without installing MySQL locally!)
        string sqliteDir = "/app/data";
        string sqlitePath = "cozy_local.db";
        if (System.IO.Directory.Exists(sqliteDir))
        {
            sqlitePath = System.IO.Path.Combine(sqliteDir, "cozy.db");
        }
        options.UseSqlite($"Data Source={sqlitePath}");
    }
});

// 3. Data Protection keys (sign session cookies). Persist to the Railway volume so logins survive redeploys.
var dataProtection = builder.Services.AddDataProtection().SetApplicationName("Cozy");
if (System.IO.Directory.Exists("/app/data"))
{
    dataProtection.PersistKeysToFileSystem(new System.IO.DirectoryInfo("/app/data/dp-keys"));
}

// Compress static assets (app.js / app.css / index.html) for faster loading on mobile networks.
// API JSON is intentionally left uncompressed to avoid compression side-channel risks over HTTPS.
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
    options.MimeTypes = new[] { "text/html", "text/css", "application/javascript", "text/javascript", "image/svg+xml", "application/manifest+json" };
});

// 4. Swagger / OpenAPI
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "永倉管理系統 API",
        Version = "v1",
        Description = "客戶資料、工作行程、報價管理與收費紀錄 API"
    });
});

var app = builder.Build();

// 5. Automatic Database Initialization (EnsureCreated and automatic table schema migrations)
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var logger = services.GetRequiredService<ILogger<Program>>();
    try
    {
        var db = services.GetRequiredService<AppDbContext>();
        logger.LogInformation("Ensuring database and tables exist (Provider: {Provider})...", db.Database.ProviderName);
        db.Database.EnsureCreated();

        // If running on MySQL, ensure newly added tables (like SystemUsers, Projects, ProjectFiles) are created
        if (db.Database.IsMySql())
        {
            db.Database.ExecuteSqlRaw(@"
                CREATE TABLE IF NOT EXISTS `SystemUsers` (
                    `Id` int NOT NULL AUTO_INCREMENT,
                    `Email` varchar(191) NOT NULL,
                    `Name` longtext NULL,
                    `PictureUrl` longtext NULL,
                    `Role` varchar(50) NOT NULL DEFAULT 'Staff',
                    `IsActive` tinyint(1) NOT NULL DEFAULT 1,
                    `LastLoginAt` datetime(6) NULL,
                    `CreatedAt` datetime(6) NOT NULL,
                    PRIMARY KEY (`Id`),
                    UNIQUE KEY `IX_SystemUsers_Email` (`Email`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            db.Database.ExecuteSqlRaw(@"
                CREATE TABLE IF NOT EXISTS `Projects` (
                    `Id` int NOT NULL AUTO_INCREMENT,
                    `CustomerId` int NOT NULL,
                    `ProjectNumber` varchar(50) NULL,
                    `Name` varchar(255) NOT NULL,
                    `Status` varchar(50) NOT NULL DEFAULT '進行中',
                    `ContactPerson` varchar(100) NULL,
                    `ContactPhone` varchar(50) NULL,
                    `Address` varchar(255) NULL,
                    `Budget` decimal(18,2) NULL,
                    `StartDate` datetime(6) NULL,
                    `EndDate` datetime(6) NULL,
                    `Notes` longtext NULL,
                    `CreatedAt` datetime(6) NOT NULL,
                    PRIMARY KEY (`Id`),
                    KEY `IX_Projects_CustomerId` (`CustomerId`),
                    KEY `IX_Projects_Name` (`Name`),
                    KEY `IX_Projects_ProjectNumber` (`ProjectNumber`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            db.Database.ExecuteSqlRaw(@"
                CREATE TABLE IF NOT EXISTS `ProjectFiles` (
                    `Id` int NOT NULL AUTO_INCREMENT,
                    `ProjectId` int NOT NULL,
                    `FileName` varchar(255) NOT NULL,
                    `StoredFileName` varchar(255) NOT NULL,
                    `FilePath` varchar(500) NOT NULL,
                    `FileType` varchar(50) NOT NULL,
                    `FileSizeBytes` bigint NOT NULL,
                    `Description` varchar(255) NULL,
                    `UploadedAt` datetime(6) NOT NULL,
                    PRIMARY KEY (`Id`),
                    KEY `IX_ProjectFiles_ProjectId` (`ProjectId`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            // Safe column additions / fixes
            try { db.Database.ExecuteSqlRaw("ALTER TABLE `ProjectFiles` ADD COLUMN `StoredFileName` varchar(255) NOT NULL DEFAULT '';"); } catch {}
            try { db.Database.ExecuteSqlRaw("ALTER TABLE `ProjectFiles` ADD COLUMN `FileType` varchar(50) NOT NULL DEFAULT '';"); } catch {}
            try { db.Database.ExecuteSqlRaw("ALTER TABLE `ProjectFiles` ADD COLUMN `FileSizeBytes` bigint NOT NULL DEFAULT 0;"); } catch {}
            try { db.Database.ExecuteSqlRaw("ALTER TABLE `ProjectFiles` ADD COLUMN `Description` varchar(255) NULL;"); } catch {}
            try { db.Database.ExecuteSqlRaw("ALTER TABLE `WorkLogs` ADD COLUMN `ProjectId` int NULL;"); } catch {}
            try { db.Database.ExecuteSqlRaw("ALTER TABLE `WorkLogs` ADD COLUMN `WorkType` varchar(50) NOT NULL DEFAULT '保養';"); } catch {}
            try { db.Database.ExecuteSqlRaw("ALTER TABLE `WorkLogs` ADD COLUMN `IsPriority` tinyint(1) NOT NULL DEFAULT 0;"); } catch {}
            try { db.Database.ExecuteSqlRaw("ALTER TABLE `WorkLogs` ADD COLUMN `StatusUpdatedAt` datetime(6) NULL;"); } catch {}
            try { db.Database.ExecuteSqlRaw("ALTER TABLE `Quotations` ADD COLUMN `ProjectId` int NULL;"); } catch {}
            try { db.Database.ExecuteSqlRaw("ALTER TABLE `Payments` ADD COLUMN `ProjectId` int NULL;"); } catch {}
            try { db.Database.ExecuteSqlRaw("ALTER TABLE `Payments` ADD COLUMN `InvoiceImage` longtext NULL;"); } catch {}
        }

        logger.LogInformation("Database tables initialized successfully!");
    }
    catch (Exception ex)
    {
        logger.LogWarning("Notice during DB setup: {Message}", ex.Message);
    }

    // Move legacy uploads out of wwwroot so they can never be served as public static files
    try
    {
        int movedFiles = ProjectFileStorage.MigrateLegacyUploads(app.Environment);
        if (movedFiles > 0)
        {
            logger.LogInformation("Moved {Count} legacy upload(s) out of wwwroot", movedFiles);
        }
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to move legacy uploads out of wwwroot");
    }
}

// 6. HTTP request pipeline configuration (Swagger only in Development)
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "永倉管理 API v1");
    });
}

// 7. Global Security Authentication Middleware (全面鎖定所有 API 後端存取)
// Runs before static files so that blocked paths (e.g. legacy /uploads) are never served.
app.UseResponseCompression();
app.UseMiddleware<CozyAuthMiddleware>();

// 8. Static files for PWA Web Application
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseRouting();
app.UseAuthorization();

app.MapControllers();

// 9. Fallback to index.html for SPA frontend routing
app.MapFallbackToFile("index.html");

// 9. Railway Port Binding (Railway injects PORT environment variable)
string port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
app.Run($"http://0.0.0.0:{port}");
