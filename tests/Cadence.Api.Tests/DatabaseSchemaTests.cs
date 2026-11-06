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

}
