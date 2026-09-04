using System;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;

namespace Cozy.Data
{
    public static class DbConnectionStringHelper
    {
        public static string GetMySQLConnectionString(IConfiguration configuration)
        {
            // 1. Check for MYSQL_URL or DATABASE_URL (Railway standard URL format: mysql://user:password@host:port/database)
            string? dbUrl = Environment.GetEnvironmentVariable("MYSQL_URL")
                ?? Environment.GetEnvironmentVariable("DATABASE_URL")
                ?? configuration["MYSQL_URL"]
                ?? configuration["DATABASE_URL"];

            if (!string.IsNullOrWhiteSpace(dbUrl))
            {
                var match = Regex.Match(dbUrl, @"mysql://(?<user>[^:]+):(?<password>[^@]+)@(?<host>[^:]+):(?<port>\d+)/(?<database>.+)");
                if (match.Success)
                {
                    string user = match.Groups["user"].Value;
                    string password = match.Groups["password"].Value;
                    string host = match.Groups["host"].Value;
                    string port = match.Groups["port"].Value;
                    string database = match.Groups["database"].Value;

                    return $"Server={host};Port={port};Database={database};User={user};Password={password};CharSet=utf8mb4;AllowUserVariables=True;SSL Mode=Preferred;";
                }
            }

            // 2. Check for discrete Railway environment variables
            string? hostEnv = Environment.GetEnvironmentVariable("MYSQLHOST")
                ?? Environment.GetEnvironmentVariable("MYSQL_HOST")
                ?? configuration["MYSQLHOST"];

            string? portEnv = Environment.GetEnvironmentVariable("MYSQLPORT")
                ?? Environment.GetEnvironmentVariable("MYSQL_PORT")
                ?? configuration["MYSQLPORT"]
                ?? "3306";

            string? userEnv = Environment.GetEnvironmentVariable("MYSQLUSER")
                ?? Environment.GetEnvironmentVariable("MYSQL_USER")
                ?? configuration["MYSQLUSER"]
                ?? "root";

            string? passwordEnv = Environment.GetEnvironmentVariable("MYSQLPASSWORD")
                ?? Environment.GetEnvironmentVariable("MYSQL_PASSWORD")
                ?? configuration["MYSQLPASSWORD"];

            string? databaseEnv = Environment.GetEnvironmentVariable("MYSQLDATABASE")
                ?? Environment.GetEnvironmentVariable("MYSQL_DATABASE")
                ?? configuration["MYSQLDATABASE"]
                ?? "railway";

            if (!string.IsNullOrWhiteSpace(hostEnv) && !string.IsNullOrWhiteSpace(passwordEnv))
            {
                return $"Server={hostEnv};Port={portEnv};Database={databaseEnv};User={userEnv};Password={passwordEnv};CharSet=utf8mb4;AllowUserVariables=True;SSL Mode=Preferred;";
            }

            // 3. Fallback to appsettings.json ConnectionStrings:DefaultConnection
            string? appSettingConn = configuration.GetConnectionString("DefaultConnection");
            if (!string.IsNullOrWhiteSpace(appSettingConn))
            {
                return appSettingConn;
            }

            // 4. Default local development MySQL string
            return "Server=localhost;Port=3306;Database=cozy_db;User=root;Password=root;CharSet=utf8mb4;AllowUserVariables=True;";
        }
    }
}
