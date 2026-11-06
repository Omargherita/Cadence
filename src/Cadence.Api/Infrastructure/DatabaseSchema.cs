using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Cadence.Api.Infrastructure;

/// <summary>Versioned SQLite upgrades for both new and pre-versioning installations.</summary>
public static class DatabaseSchema
{
    public static async Task InitializeAsync(CadenceDbContext db)
    {
        await db.Database.OpenConnectionAsync();
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            async Task<bool> Exists(string sql)
            {
                await using var command = db.Database.GetDbConnection().CreateCommand();
                command.Transaction = transaction.GetDbTransaction();
                command.CommandText = sql;
                return Convert.ToInt64(await command.ExecuteScalarAsync()) > 0;
            }
            if (!await Exists("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='Tasks'"))
                await db.Database.ExecuteSqlRawAsync(db.Database.GenerateCreateScript());

            await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS CadenceSchemaVersions (Version INTEGER PRIMARY KEY);");
            if (!await Exists("SELECT count(*) FROM CadenceSchemaVersions WHERE Version=1"))
            {
                if (!await Exists("SELECT count(*) FROM pragma_table_info('Tasks') WHERE name='Recurrence'"))
                    await db.Database.ExecuteSqlRawAsync("ALTER TABLE Tasks ADD COLUMN Recurrence INTEGER NOT NULL DEFAULT 0;");
                // Older installations added a nullable TEXT column. Normalize it to the enum's default.
                await db.Database.ExecuteSqlRawAsync("UPDATE Tasks SET Recurrence=0 WHERE Recurrence IS NULL;");
                if (!await Exists("SELECT count(*) FROM pragma_table_info('PracticeTakes') WHERE name='ObjectiveDspMetricsJson'"))
                    await db.Database.ExecuteSqlRawAsync("ALTER TABLE PracticeTakes ADD COLUMN ObjectiveDspMetricsJson TEXT;");
                await db.Database.ExecuteSqlRawAsync("INSERT INTO CadenceSchemaVersions (Version) VALUES (1);");
            }
            await transaction.CommitAsync();
        }
        finally { await db.Database.CloseConnectionAsync(); }
    }
}
