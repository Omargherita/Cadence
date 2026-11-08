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
            if (!await Exists("SELECT count(*) FROM CadenceSchemaVersions WHERE Version=2"))
            {
                await DeduplicatePracticeTakeNumbersAsync(db, transaction);
                await db.Database.ExecuteSqlRawAsync(
                    "CREATE UNIQUE INDEX IF NOT EXISTS IX_PracticeTakes_PracticeSessionId_TakeNumber ON PracticeTakes (PracticeSessionId, TakeNumber);");
                await db.Database.ExecuteSqlRawAsync("INSERT INTO CadenceSchemaVersions (Version) VALUES (2);");
            }
            if (!await Exists("SELECT count(*) FROM CadenceSchemaVersions WHERE Version=3"))
            {
                foreach (var table in new[] { "Tasks", "Pieces", "PracticeSessions", "PracticeTakes" })
                    if (!await Exists($"SELECT count(*) FROM pragma_table_info('{table}') WHERE name='CreateFingerprint'"))
                    {
                        // Identifiers come exclusively from the fixed list above, never request input.
                        var sql = $"ALTER TABLE {table} ADD COLUMN CreateFingerprint TEXT;";
                        await db.Database.ExecuteSqlRawAsync(sql);
                    }
                foreach (var column in new[] { "SeriesId", "OccurrenceDate", "NextOccurrenceId" })
                    if (!await Exists($"SELECT count(*) FROM pragma_table_info('Tasks') WHERE name='{column}'"))
                    {
                        var sql = $"ALTER TABLE Tasks ADD COLUMN {column} TEXT;";
                        await db.Database.ExecuteSqlRawAsync(sql);
                    }
                // Historical ancestry cannot be recovered from title/date. Preserve every row as its own series.
                await db.Database.ExecuteSqlRawAsync("UPDATE Tasks SET SeriesId=Id, OccurrenceDate=COALESCE(ScheduledDate, date('now', 'localtime')) WHERE Recurrence<>0 AND SeriesId IS NULL;");
                await db.Database.ExecuteSqlRawAsync("CREATE UNIQUE INDEX IF NOT EXISTS IX_Tasks_SeriesId_OccurrenceDate ON Tasks (SeriesId, OccurrenceDate);");
                // Old create payloads were not retained. Leave fingerprints NULL rather than invent history.
                await db.Database.ExecuteSqlRawAsync("INSERT INTO CadenceSchemaVersions (Version) VALUES (3);");
            }
            await transaction.CommitAsync();
        }
        finally { await db.Database.CloseConnectionAsync(); }
    }

    private static async Task DeduplicatePracticeTakeNumbersAsync(CadenceDbContext db, IDbContextTransaction transaction)
    {
        var conn = db.Database.GetDbConnection();
        var affectedSessions = new List<string>();

        await using (var cmd = conn.CreateCommand())
        {
            cmd.Transaction = transaction.GetDbTransaction();
            cmd.CommandText = @"
                SELECT CAST(PracticeSessionId AS TEXT)
                FROM PracticeTakes
                GROUP BY PracticeSessionId, TakeNumber
                HAVING COUNT(*) > 1
                UNION
                SELECT DISTINCT CAST(PracticeSessionId AS TEXT)
                FROM PracticeTakes
                WHERE TakeNumber <= 0;";
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                affectedSessions.Add(reader.GetString(0));
            }
        }

        foreach (var sessionId in affectedSessions.Distinct())
        {
            var rows = new List<(string Id, int TakeNumber)>();
            await using (var cmd = conn.CreateCommand())
            {
                cmd.Transaction = transaction.GetDbTransaction();
                cmd.CommandText = @"
                    SELECT CAST(Id AS TEXT), TakeNumber
                    FROM PracticeTakes
                    WHERE CAST(PracticeSessionId AS TEXT) = $sessionId
                    ORDER BY TakeNumber ASC, CreatedAtUtc ASC, CAST(Id AS TEXT) ASC;";
                var p = cmd.CreateParameter();
                p.ParameterName = "$sessionId";
                p.Value = sessionId;
                cmd.Parameters.Add(p);

                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    rows.Add((reader.GetString(0), reader.GetInt32(1)));
                }
            }

            int maxSeen = 0;
            foreach (var (id, currentNum) in rows)
            {
                int targetNum = currentNum > maxSeen ? currentNum : maxSeen + 1;
                maxSeen = targetNum;

                if (targetNum != currentNum)
                {
                    await using var updateCmd = conn.CreateCommand();
                    updateCmd.Transaction = transaction.GetDbTransaction();
                    updateCmd.CommandText = "UPDATE PracticeTakes SET TakeNumber = $newNum WHERE CAST(Id AS TEXT) = $id;";
                    var pNum = updateCmd.CreateParameter();
                    pNum.ParameterName = "$newNum";
                    pNum.Value = targetNum;
                    updateCmd.Parameters.Add(pNum);

                    var pId = updateCmd.CreateParameter();
                    pId.ParameterName = "$id";
                    pId.Value = id;
                    updateCmd.Parameters.Add(pId);

                    await updateCmd.ExecuteNonQueryAsync();
                }
            }
        }
    }
}
