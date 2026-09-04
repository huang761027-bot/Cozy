using System;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Cozy.Data;
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

// 3. CORS configuration
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
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
                    `OriginalFileName` varchar(255) NOT NULL,
                    `ContentType` varchar(100) NOT NULL,
                    `FileSize` bigint NOT NULL,
                    `FilePath` varchar(500) NOT NULL,
                    `UploadedAt` datetime(6) NOT NULL,
                    PRIMARY KEY (`Id`),
                    KEY `IX_ProjectFiles_ProjectId` (`ProjectId`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");

            // Safe column additions
            try { db.Database.ExecuteSqlRaw("ALTER TABLE `WorkLogs` ADD COLUMN `ProjectId` int NULL;"); } catch {}
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
}

// 6. HTTP request pipeline configuration
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "永倉管理 API v1");
});

app.UseCors("AllowAll");

// 7. Static files for PWA Web Application
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseRouting();
app.UseAuthorization();

// 8. Global Security Authentication Middleware (全面鎖定所有 API 後端存取)
app.UseMiddleware<CozyAuthMiddleware>();

app.MapControllers();

// 9. Fallback to index.html for SPA frontend routing
app.MapFallbackToFile("index.html");

// 9. Railway Port Binding (Railway injects PORT environment variable)
string port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
app.Run($"http://0.0.0.0:{port}");
