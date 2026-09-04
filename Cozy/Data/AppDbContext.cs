using Microsoft.EntityFrameworkCore;
using Cozy.Models;

namespace Cozy.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<Customer> Customers => Set<Customer>();
        public DbSet<Project> Projects => Set<Project>();
        public DbSet<ProjectFile> ProjectFiles => Set<ProjectFile>();
        public DbSet<WorkLog> WorkLogs => Set<WorkLog>();
        public DbSet<Quotation> Quotations => Set<Quotation>();
        public DbSet<QuotationItem> QuotationItems => Set<QuotationItem>();
        public DbSet<Payment> Payments => Set<Payment>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Customers -> Projects (Cascade on delete)
            modelBuilder.Entity<Customer>()
                .HasMany(c => c.Projects)
                .WithOne(p => p.Customer)
                .HasForeignKey(p => p.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);

            // Projects -> Files (Cascade on delete)
            modelBuilder.Entity<Project>()
                .HasMany(p => p.Files)
                .WithOne(f => f.Project)
                .HasForeignKey(f => f.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            // Customers -> WorkLogs (SetNull on delete)
            modelBuilder.Entity<Customer>()
                .HasMany(c => c.WorkLogs)
                .WithOne(w => w.Customer)
                .HasForeignKey(w => w.CustomerId)
                .OnDelete(DeleteBehavior.SetNull);

            // Customers -> Quotations (Cascade on delete)
            modelBuilder.Entity<Customer>()
                .HasMany(c => c.Quotations)
                .WithOne(q => q.Customer)
                .HasForeignKey(q => q.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);

            // Customers -> Payments (SetNull on delete since payments can be standalone/anonymous)
            modelBuilder.Entity<Customer>()
                .HasMany(c => c.Payments)
                .WithOne(p => p.Customer)
                .HasForeignKey(p => p.CustomerId)
                .OnDelete(DeleteBehavior.SetNull);

            // Quotation and items
            modelBuilder.Entity<Quotation>()
                .HasMany(q => q.Items)
                .WithOne(i => i.Quotation)
                .HasForeignKey(i => i.QuotationId)
                .OnDelete(DeleteBehavior.Cascade);

            // Indexing for faster searching
            modelBuilder.Entity<Customer>()
                .HasIndex(c => c.Name);

            modelBuilder.Entity<Customer>()
                .HasIndex(c => c.Category);

            modelBuilder.Entity<Project>()
                .HasIndex(p => p.ProjectNumber);

            modelBuilder.Entity<Project>()
                .HasIndex(p => p.Name);

            modelBuilder.Entity<WorkLog>()
                .HasIndex(w => w.ScheduledAt);

            modelBuilder.Entity<Quotation>()
                .HasIndex(q => q.QuotationNumber)
                .IsUnique();

            modelBuilder.Entity<Payment>()
                .HasIndex(p => p.PaymentDate);
        }
    }
}
