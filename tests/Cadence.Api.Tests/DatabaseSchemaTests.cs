using Cadence.Api.Infrastructure;
using Cadence.Api.Domain.Organizer;
using Microsoft.EntityFrameworkCore;

namespace Cadence.Api.Tests;

public class DatabaseSchemaTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task InitializationPreservesRowsAndUpgradesLegacySchema(bool legacy)
    {
        var path = Path.Combine(Path.GetTempPath(), $"cadence-schema-{Guid.NewGuid()}.db");
        try
        {
            await using var db = new CadenceDbContext(new DbContextOptionsBuilder<CadenceDbContext>().UseSqlite($"Data Source={path};Pooling=False").Options);
            if (legacy) await db.Database.EnsureCreatedAsync();
            else await DatabaseSchema.InitializeAsync(db);
            db.Tasks.Add(new TaskItem { Title = "Keep me" });
            await db.SaveChangesAsync();
            if (legacy)
            {
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE Tasks DROP COLUMN Recurrence;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE PracticeTakes DROP COLUMN ObjectiveDspMetricsJson;");
            }
            db.ChangeTracker.Clear();
            await DatabaseSchema.InitializeAsync(db);
            await DatabaseSchema.InitializeAsync(db);
            var task = await db.Tasks.SingleAsync();
            Assert.Equal("Keep me", task.Title);
            Assert.Equal(RecurrencePattern.None, task.Recurrence);
            Assert.Empty(await db.PracticeTakes.ToListAsync());
        }
        finally { File.Delete(path); }
    }
    [Fact]
    public async Task Version3PreservesAmbiguousLegacyTasksAndEnforcesOccurrenceUniqueness()
    {
        var path = Path.Combine(Path.GetTempPath(), $"cadence-schema-v3-{Guid.NewGuid()}.db");
        try
        {
            await using var db = new CadenceDbContext(new DbContextOptionsBuilder<CadenceDbContext>().UseSqlite($"Data Source={path};Pooling=False").Options);
            await db.Database.EnsureCreatedAsync();
            var first = new TaskItem { Title = "Same title", Recurrence = RecurrencePattern.Daily, ScheduledDate = new DateOnly(2026, 10, 23) };
            var second = new TaskItem { Title = first.Title, Recurrence = first.Recurrence, ScheduledDate = first.ScheduledDate };
            db.Tasks.AddRange(first, second);
            await db.SaveChangesAsync();
            await db.Database.ExecuteSqlRawAsync("DROP INDEX IX_Tasks_SeriesId_OccurrenceDate;");
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE Tasks DROP COLUMN SeriesId;");
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE Tasks DROP COLUMN OccurrenceDate;");
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE Tasks DROP COLUMN NextOccurrenceId;");
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE Tasks DROP COLUMN CreateFingerprint;");
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE Pieces DROP COLUMN CreateFingerprint;");
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE PracticeSessions DROP COLUMN CreateFingerprint;");
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE PracticeTakes DROP COLUMN CreateFingerprint;");
            db.ChangeTracker.Clear();
            await DatabaseSchema.InitializeAsync(db);
            await DatabaseSchema.InitializeAsync(db);
            var tasks = await db.Tasks.OrderBy(t => t.Id).ToListAsync();
            Assert.Equal(2, tasks.Count);
            Assert.All(tasks, t => { Assert.Equal(t.Id, t.SeriesId); Assert.Equal(first.ScheduledDate, t.OccurrenceDate); Assert.Null(t.CreateFingerprint); });
            db.Tasks.Add(new TaskItem { Title = "Duplicate", SeriesId = tasks[0].SeriesId, OccurrenceDate = tasks[0].OccurrenceDate });
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public async Task DeletingPieceCascadesThroughSessionsTakesAndWeaknesses()
    {
        await using var connection = new Microsoft.Data.Sqlite.SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var db = new CadenceDbContext(new DbContextOptionsBuilder<CadenceDbContext>().UseSqlite(connection).Options);
        await DatabaseSchema.InitializeAsync(db);
        var piece = new Cadence.Api.Domain.MusicalLibrary.Piece { Title = "Piece", Composer = "Composer" };
        var session = new Cadence.Api.Domain.MusicalLibrary.PracticeSession { Piece = piece };
        db.PracticeTakes.Add(new Cadence.Api.Domain.PianoMentor.PracticeTake { PracticeSession = session });
        db.Weaknesses.Add(new Cadence.Api.Domain.PianoMentor.PieceWeakness { Piece = piece, Location = "Bar 1", Description = "Timing" });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        db.Pieces.Remove(await db.Pieces.SingleAsync());
        await db.SaveChangesAsync();
        Assert.Empty(await db.PracticeSessions.ToListAsync());
        Assert.Empty(await db.PracticeTakes.ToListAsync());
        Assert.Empty(await db.Weaknesses.ToListAsync());
    }

    [Fact]
    public async Task SchemaUpgradeVersion2DeduplicatesExistingCollidingTakeNumbers()
    {
        var path = Path.Combine(Path.GetTempPath(), $"cadence-schema-v2-{Guid.NewGuid()}.db");
        try
        {
            await using var db = new CadenceDbContext(new DbContextOptionsBuilder<CadenceDbContext>().UseSqlite($"Data Source={path};Pooling=False").Options);
            await db.Database.EnsureCreatedAsync();

            // Simulate a pre-v2 database where IX_PracticeTakes_PracticeSessionId_TakeNumber did not exist
            await db.Database.ExecuteSqlRawAsync("DROP INDEX IF EXISTS IX_PracticeTakes_PracticeSessionId_TakeNumber;");
            await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS CadenceSchemaVersions (Version INTEGER PRIMARY KEY);");
            await db.Database.ExecuteSqlRawAsync("INSERT INTO CadenceSchemaVersions (Version) VALUES (1);");

            var piece = new Cadence.Api.Domain.MusicalLibrary.Piece { Id = Guid.CreateVersion7(), Title = "Piece", Composer = "Composer" };
            var session = new Cadence.Api.Domain.MusicalLibrary.PracticeSession { Id = Guid.CreateVersion7(), PieceId = piece.Id };
            var takeA = new Cadence.Api.Domain.PianoMentor.PracticeTake
            {
                Id = Guid.CreateVersion7(),
                PracticeSessionId = session.Id,
                TakeNumber = 2,
                CreatedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-10)
            };
            var takeB = new Cadence.Api.Domain.PianoMentor.PracticeTake
            {
                Id = Guid.CreateVersion7(),
                PracticeSessionId = session.Id,
                TakeNumber = 2,
                CreatedAtUtc = DateTimeOffset.UtcNow.AddMinutes(-5)
            };

            db.Pieces.Add(piece);
            db.PracticeSessions.Add(session);
            db.PracticeTakes.AddRange(takeA, takeB);
            await db.SaveChangesAsync();
            db.ChangeTracker.Clear();

            // Run InitializeAsync to apply Version 2 migration
            await DatabaseSchema.InitializeAsync(db);

            var takes = await db.PracticeTakes
                .Where(t => t.PracticeSessionId == session.Id)
                .OrderBy(t => t.TakeNumber)
                .ToListAsync();

            Assert.Equal(2, takes.Count);
            Assert.Equal(takeA.Id, takes[0].Id);
            Assert.Equal(2, takes[0].TakeNumber);
            Assert.Equal(takeB.Id, takes[1].Id);
            Assert.Equal(3, takes[1].TakeNumber);
        }
        finally
        {
            if (File.Exists(path)) File.Delete(path);
        }
    }
}
