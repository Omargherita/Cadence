using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Domain.Organizer;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Cadence.Api.Infrastructure;

public class CadenceDbContext : DbContext
{
    public CadenceDbContext(DbContextOptions<CadenceDbContext> options)
        : base(options)
    {
    }

    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<Piece> Pieces => Set<Piece>();
    public DbSet<PracticeSession> PracticeSessions => Set<PracticeSession>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<DateTimeOffset>()
            .HaveConversion<DateTimeOffsetToBinaryConverter>();

        configurationBuilder.Properties<DateTimeOffset?>()
            .HaveConversion<DateTimeOffsetToBinaryConverter>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<TaskItem>(entity =>
        {
            entity.HasKey(t => t.Id);
            entity.Property(t => t.Title)
                .IsRequired()
                .HasMaxLength(200);
            entity.Property(t => t.Priority)
                .HasDefaultValue(2);
            entity.Property(t => t.IsCompleted)
                .HasDefaultValue(false);
            entity.Property(t => t.UpdatedAtUtc)
                .IsRequired();
        });

        modelBuilder.Entity<Piece>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Title)
                .IsRequired()
                .HasMaxLength(200);
            entity.Property(p => p.Composer)
                .IsRequired()
                .HasMaxLength(150);
            entity.Property(p => p.UpdatedAtUtc)
                .IsRequired();

            entity.HasMany(p => p.Sessions)
                .WithOne(s => s.Piece)
                .HasForeignKey(s => s.PieceId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PracticeSession>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.StartedAtUtc)
                .IsRequired();
            entity.Property(s => s.DurationMinutes)
                .IsRequired();
        });
    }
}
