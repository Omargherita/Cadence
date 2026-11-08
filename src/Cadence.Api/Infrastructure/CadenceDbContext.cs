using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Domain.Organizer;
using Cadence.Api.Domain.PianoMentor;
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
    public DbSet<PieceWeakness> Weaknesses => Set<PieceWeakness>();
    public DbSet<PracticeTake> PracticeTakes => Set<PracticeTake>();

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
            entity.HasIndex(t => new { t.SeriesId, t.OccurrenceDate }).IsUnique();
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

            entity.HasMany(p => p.Weaknesses)
                .WithOne(w => w.Piece)
                .HasForeignKey(w => w.PieceId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PracticeSession>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.StartedAtUtc)
                .IsRequired();
            entity.Property(s => s.DurationMinutes)
                .IsRequired();

            entity.HasMany(s => s.Takes)
                .WithOne(t => t.PracticeSession)
                .HasForeignKey(t => t.PracticeSessionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PieceWeakness>(entity =>
        {
            entity.HasKey(w => w.Id);
            entity.Property(w => w.Location)
                .IsRequired()
                .HasMaxLength(200);
            entity.Property(w => w.Description)
                .IsRequired();
            entity.Property(w => w.OccurrenceCount)
                .HasDefaultValue(1);
            entity.Property(w => w.ConsecutiveCleanSessions)
                .HasDefaultValue(0);
        });

        modelBuilder.Entity<PracticeTake>(entity =>
        {
            entity.HasKey(t => t.Id);
            entity.Property(t => t.TakeNumber)
                .IsRequired();
            entity.HasIndex(t => new { t.PracticeSessionId, t.TakeNumber })
                .IsUnique();
            entity.Property(t => t.ObjectiveDspMetricsJson)
                .IsRequired(false);
            entity.Property(t => t.CreatedAtUtc)
                .IsRequired();

            entity.OwnsOne(t => t.Assessment, a =>
            {
                a.ToJson();
                a.OwnsOne(x => x.IntraSessionComparison);
                a.OwnsOne(x => x.EvidenceBreakdown);
                a.OwnsMany(x => x.ExistingWeaknessEvaluations);
                a.OwnsMany(x => x.NewlyDetectedIssues);
                a.OwnsOne(x => x.ImmediateNextTakeDrill);
                a.OwnsOne(x => x.NextSessionPracticePlan, plan =>
                {
                    plan.OwnsMany(p => p.Drills);
                });
            });
        });
    }
}
