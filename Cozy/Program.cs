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

// 2. Configure MySQL Database with Pomelo
string connectionString = DbConnectionStringHelper.GetMySQLConnectionString(builder.Configuration);
builder.Services.AddDbContext<AppDbContext>(options =>
{
    // Use MySQL with auto server version detection or fallback version 8.0
    options.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString), mySqlOptions =>
    {
        mySqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null);
    });
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
        Title = "Cozy 業務管理系統 API",
        Version = "v1",
        Description = "客戶資料、工作行程、報價單與收費管理 API"
    });
});

var app = builder.Build();

// 5. Automatic Database Initialization (EnsureCreated for Railway / MySQL)
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var logger = services.GetRequiredService<ILogger<Program>>();
    try
    {
        var db = services.GetRequiredService<AppDbContext>();
        logger.LogInformation("Checking and creating MySQL database and tables if not exist...");
        db.Database.EnsureCreated();
        logger.LogInformation("Database initialized successfully.");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "An error occurred while migrating/creating the database.");
    }
}

// 6. HTTP request pipeline configuration
if (app.Environment.IsDevelopment() || true) // Enable Swagger on Railway as well for easy testing
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Cozy API v1");
    });
}

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
