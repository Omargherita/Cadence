using Cadence.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Cadence.Api.Features.System;

public static class SystemEndpoints
{
    private static readonly SemaphoreSlim BackupMutex = new(1, 1);
    private const int DefaultBackupRetentionCount = 30;

    public static RouteGroupBuilder MapSystemEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api")
            .WithTags("System");

        group.MapGet("/health", () =>
        {
            return Results.Ok(new
            {
                status = "online",
                timestampUtc = DateTimeOffset.UtcNow
            });
        });

        group.MapPost("/system/backup", async (
            CadenceDbContext db,
            CadenceStoragePaths paths,
            IConfiguration config,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("Cadence.SystemBackup");
            paths.EnsureDirectoriesCreated();

            await BackupMutex.WaitAsync(ct);
            try
            {
                await using var fileLock = await AcquireCrossProcessLockAsync(paths.BackupsDir, ct);

                var now = DateTimeOffset.UtcNow;
                var timestamp = now.ToString("yyyyMMdd_HHmmss_fff");
                var uniqueSuffix = Guid.CreateVersion7().ToString("N")[..8];
                var backupFileName = $"cadence-{timestamp}-{uniqueSuffix}.db";
                var finalBackupPath = Path.Combine(paths.BackupsDir, backupFileName);
                var stagingPath = Path.Combine(paths.BackupsDir, $".{backupFileName}.tmp");

                if (File.Exists(finalBackupPath) || File.Exists(stagingPath))
                {
                    return Results.Conflict(new { error = "Backup destination already exists; refusing to overwrite." });
                }

                try
                {
                    var escapedStaging = stagingPath.Replace("'", "''");
                    var vacuumSql = "VACUUM INTO '" + escapedStaging + "';";
                    await db.Database.ExecuteSqlRawAsync(vacuumSql, ct);

                    CadenceStoragePaths.SetPrivateFilePermissions(stagingPath);
                    File.Move(stagingPath, finalBackupPath, overwrite: false);
                    CadenceStoragePaths.SetPrivateFilePermissions(finalBackupPath);
                }
                catch
                {
                    TryDeleteFile(stagingPath);
                    throw;
                }

                var retentionCount = ResolveRetentionCount(config);
                PruneOldBackups(paths.BackupsDir, retentionCount, logger);

                return Results.Ok(new
                {
                    backupPath = finalBackupPath,
                    timestampUtc = now
                });
            }
            finally
            {
                BackupMutex.Release();
            }
        });

        return group;
    }

    private static int ResolveRetentionCount(IConfiguration config)
    {
        var raw = config["Cadence:BackupRetentionCount"]
                  ?? Environment.GetEnvironmentVariable("CADENCE_BACKUP_RETENTION_COUNT");
        return int.TryParse(raw, out var parsed) && parsed > 0 ? parsed : DefaultBackupRetentionCount;
    }

    private static void PruneOldBackups(string backupsDir, int keepCount, ILogger logger)
    {
        try
        {
            var dirInfo = new DirectoryInfo(backupsDir);
            if (!dirInfo.Exists) return;

            var backupFiles = dirInfo.GetFiles("*.db", SearchOption.TopDirectoryOnly)
                .Where(f => f.Name.StartsWith("cadence-", StringComparison.Ordinal) ||
                            f.Name.StartsWith("app_", StringComparison.Ordinal))
                .OrderByDescending(f => f.Name, StringComparer.Ordinal)
                .ThenByDescending(f => f.LastWriteTimeUtc)
                .Skip(keepCount)
                .ToList();

            foreach (var oldFile in backupFiles)
            {
                try
                {
                    oldFile.Delete();
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Could not prune old backup file {Path}", oldFile.FullName);
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to evaluate backup retention in {BackupsDir}", backupsDir);
        }
    }

    private static async Task<FileStream> AcquireCrossProcessLockAsync(string backupsDir, CancellationToken ct)
    {
        var lockPath = Path.Combine(backupsDir, ".backup.lock");
        const int maxAttempts = 50;
        for (int attempt = 1; ; attempt++)
        {
            try
            {
                var stream = new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
                CadenceStoragePaths.SetPrivateFilePermissions(lockPath);
                return stream;
            }
            catch (IOException) when (attempt < maxAttempts)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(50), ct);
            }
        }
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
            // Ignored
        }
    }
}
