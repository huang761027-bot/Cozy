using System;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Cozy.Data;

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

// 5. Automatic Database Initialization (EnsureCreated for MySQL / SQLite)
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var logger = services.GetRequiredService<ILogger<Program>>();
    try
    {
        var db = services.GetRequiredService<AppDbContext>();
        logger.LogInformation("Ensuring database and tables exist (Provider: {Provider})...", db.Database.ProviderName);
        db.Database.EnsureCreated();
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

app.MapControllers();

// 8. Fallback to index.html for SPA frontend routing
app.MapFallbackToFile("index.html");

// 9. Railway Port Binding (Railway injects PORT environment variable)
string port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
app.Run($"http://0.0.0.0:{port}");
