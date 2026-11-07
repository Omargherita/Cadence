using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Domain.Organizer;
using Cadence.Api.Features.MusicalLibrary;
using Cadence.Api.Features.Organizer;
using Cadence.Api.Features.PianoMentor;
using Cadence.Api.Features.System;
using Cadence.Api.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Cadence.Api.Tests;

public class BackupAndRestoreTests
{
    private static string GetRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "Cadence.sln")))
        {
            dir = dir.Parent;
        }
        return dir?.FullName ?? throw new InvalidOperationException("Could not locate Cadence.sln root.");
    }

    private sealed class DisposableBackupHost : IAsyncDisposable
    {
        public string TempRoot { get; }
        public CadenceStoragePaths StoragePaths { get; }
        public WebApplication App { get; }
        public HttpClient Client { get; }

        private DisposableBackupHost(string tempRoot, CadenceStoragePaths storagePaths, WebApplication app, HttpClient client)
        {
            TempRoot = tempRoot;
            StoragePaths = storagePaths;
            App = app;
            Client = client;
        }

        public static async Task<DisposableBackupHost> CreateAsync(int? backupRetentionCount = null)
        {
            var tempRoot = Path.Combine(Path.GetTempPath(), $"cadence_batch4_test_{Guid.NewGuid():N}");

            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                Args = ["--urls", "http://127.0.0.1:0"]
            });
            builder.Logging.ClearProviders();

            var settings = new Dictionary<string, string?>
            {
                ["Cadence:StorageRoot"] = tempRoot
            };
            if (backupRetentionCount.HasValue)
            {
                settings["Cadence:BackupRetentionCount"] = backupRetentionCount.Value.ToString();
            }
            builder.Configuration.AddInMemoryCollection(settings);

            var storagePaths = new CadenceStoragePaths(builder.Configuration["Cadence:StorageRoot"]);
            storagePaths.EnsureDirectoriesCreated();
            builder.Services.AddSingleton(storagePaths);

            builder.Services.AddSingleton<SqlitePragmaConnectionInterceptor>();
            builder.Services.AddDbContext<CadenceDbContext>((sp, options) =>
            {
                var interceptor = sp.GetRequiredService<SqlitePragmaConnectionInterceptor>();
                options.UseSqlite($"Data Source={storagePaths.DatabasePath};Pooling=False")
                       .AddInterceptors(interceptor);
            });

            builder.Services.ConfigureHttpJsonOptions(options =>
            {
                options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
                options.SerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
            });

            var app = builder.Build();

            using (var scope = app.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<CadenceDbContext>();
                await DatabaseSchema.InitializeAsync(db);
                await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;");
                await db.Database.ExecuteSqlRawAsync("PRAGMA synchronous=NORMAL;");
            }

            app.MapSystemEndpoints();
            app.MapTaskEndpoints();
            app.MapMusicalLibraryEndpoints();

            await app.StartAsync();
            var address = app.Urls.Single();
            var client = new HttpClient { BaseAddress = new Uri(address) };

            return new DisposableBackupHost(tempRoot, storagePaths, app, client);
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await App.StopAsync();
            await App.DisposeAsync();
            try
            {
                if (Directory.Exists(TempRoot))
                {
                    Directory.Delete(TempRoot, recursive: true);
                }
            }
            catch
            {
                // Ignored
            }
        }
    }

    [Fact]
    public async Task RestoreProcedure_AfterUncleanWalTermination_RestoresExactBackupRowsAndArchivesPreRestoreSidecars()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"cadence_b14_test_{Guid.NewGuid():N}");
        var paths = new CadenceStoragePaths(tempRoot);
        paths.EnsureDirectoriesCreated();

        try
        {
            // 1. Initialize DB in WAL mode and commit Row 1 (checkpointed into main DB)
            await using (var db = new CadenceDbContext(new DbContextOptionsBuilder<CadenceDbContext>()
                .UseSqlite($"Data Source={paths.DatabasePath};Pooling=False").Options))
            {
                await DatabaseSchema.InitializeAsync(db);
                await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;");
                db.Tasks.Add(new TaskItem
                {
                    Id = Guid.CreateVersion7(),
                    Title = "Row 1 (In Backup)",
                    Category = TaskCategory.Piano,
                    Priority = 1,
                    UpdatedAtUtc = DateTimeOffset.UtcNow
                });
                await db.SaveChangesAsync();
                await db.Database.ExecuteSqlRawAsync("PRAGMA wal_checkpoint(TRUNCATE);");
            }

            // 2. Create a clean backup containing only Row 1
            var backupFile = Path.Combine(paths.BackupsDir, "cadence-20261107_120000_000-test0001.db");
            var escapedBackup = backupFile.Replace("'", "''");
            await using (var conn = new SqliteConnection($"Data Source={paths.DatabasePath};Pooling=False"))
            {
                await conn.OpenAsync();
                await using var cmd = conn.CreateCommand();
                cmd.CommandText = $"VACUUM INTO '{escapedBackup}';";
                await cmd.ExecuteNonQueryAsync();
            }

            // 3. Commit Row 2 into WAL and simulate unclean termination (prevent checkpoint on close)
            var walPath = paths.DatabasePath + "-wal";
            var shmPath = paths.DatabasePath + "-shm";
            byte[] survivingWalBytes;
            await using (var conn = new SqliteConnection($"Data Source={paths.DatabasePath};Pooling=False"))
            {
                await conn.OpenAsync();
                await using (var pragmaCmd = conn.CreateCommand())
                {
                    pragmaCmd.CommandText = "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;";
                    await pragmaCmd.ExecuteNonQueryAsync();
                }
                await using (var insertCmd = conn.CreateCommand())
                {
                    insertCmd.CommandText = @"
                        INSERT INTO Tasks (Id, Title, Category, Priority, Recurrence, IsCompleted, UpdatedAtUtc)
                        VALUES ($id, 'Row 2 (Post-Backup WAL Only)', 2, 2, 0, 0, 1000);";
                    insertCmd.Parameters.AddWithValue("$id", Guid.CreateVersion7().ToString());
                    await insertCmd.ExecuteNonQueryAsync();
                }

                // Snapshot the uncheckpointed WAL file while connection is still open (simulating SIGKILL / power loss)
                survivingWalBytes = await File.ReadAllBytesAsync(walPath);
            }

            // Restore the uncheckpointed WAL file to disk so it survives just like an unclean crash
            await File.WriteAllBytesAsync(walPath, survivingWalBytes);
            Assert.True(File.Exists(walPath) && new FileInfo(walPath).Length > 0);

            // Verify the bug from the old README: naive cp of backup over app.db leaves app.db-wal alive and resurrects 2 rows!
            var naiveDir = Path.Combine(tempRoot, "naive_check");
            Directory.CreateDirectory(naiveDir);
            var naiveDbPath = Path.Combine(naiveDir, "app.db");
            File.Copy(backupFile, naiveDbPath, overwrite: true);
            File.Copy(walPath, naiveDbPath + "-wal", overwrite: true);
            await using (var naiveConn = new SqliteConnection($"Data Source={naiveDbPath};Pooling=False"))
            {
                await naiveConn.OpenAsync();
                await using var countCmd = naiveConn.CreateCommand();
                countCmd.CommandText = "SELECT COUNT(*) FROM Tasks;";
                var naiveCount = Convert.ToInt64(await countCmd.ExecuteScalarAsync());
                Assert.Equal(2L, naiveCount); // Reproduces B14!
            }

            // 4. Now run deploy/restore-db.sh against our disposable StorageRoot
            var restoreScript = Path.Combine(GetRepoRoot(), "deploy", "restore-db.sh");
            Assert.True(File.Exists(restoreScript), $"Expected restore script at {restoreScript}");

            var psi = new ProcessStartInfo
            {
                FileName = "bash",
                ArgumentList = { restoreScript, backupFile },
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };
            psi.Environment["CADENCE_STORAGE_ROOT"] = tempRoot;
            psi.Environment["CADENCE_SKIP_SERVICE_CHECK"] = "1";

            using (var proc = Process.Start(psi)!)
            {
                var stdout = await proc.StandardOutput.ReadToEndAsync();
                var stderr = await proc.StandardError.ReadToEndAsync();
                await proc.WaitForExitAsync();
                Assert.True(proc.ExitCode == 0, $"restore-db.sh failed ({proc.ExitCode}): {stdout}\n{stderr}");
            }

            // 5. Verify stale -wal/-shm sidecars were removed from active db directory
            Assert.False(File.Exists(walPath), "Stale -wal file should be removed before reopening.");
            Assert.False(File.Exists(shmPath), "Stale -shm file should be removed before reopening.");

            // 6. Verify pre-restore folder preserved the previous db + -wal sidecar
            var preRestoreRoot = Path.Combine(paths.BackupsDir, "pre-restore");
            Assert.True(Directory.Exists(preRestoreRoot), "Expected backups/pre-restore directory.");
            var preRestoreDirs = Directory.GetDirectories(preRestoreRoot, "pre-restore-*");
            Assert.Single(preRestoreDirs);
            Assert.True(File.Exists(Path.Combine(preRestoreDirs[0], "app.db")));
            Assert.True(File.Exists(Path.Combine(preRestoreDirs[0], "app.db-wal")));

            // 7. Reopen restored database and assert it contains EXACTLY Row 1 from the backup
            await using (var restoredDb = new CadenceDbContext(new DbContextOptionsBuilder<CadenceDbContext>()
                .UseSqlite($"Data Source={paths.DatabasePath};Pooling=False").Options))
            {
                var tasks = await restoredDb.Tasks.AsNoTracking().ToListAsync();
                var single = Assert.Single(tasks);
                Assert.Equal("Row 1 (In Backup)", single.Title);
            }

            // 8. Verify a corrupt backup is rejected by restore-db.sh without touching the active database
            var corruptBackup = Path.Combine(paths.BackupsDir, "corrupt.db");
            await File.WriteAllTextAsync(corruptBackup, "NOT_A_SQLITE_DATABASE");
            var corruptPsi = new ProcessStartInfo
            {
                FileName = "bash",
                ArgumentList = { restoreScript, corruptBackup },
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };
            corruptPsi.Environment["CADENCE_STORAGE_ROOT"] = tempRoot;
            corruptPsi.Environment["CADENCE_SKIP_SERVICE_CHECK"] = "1";

            using (var corruptProc = Process.Start(corruptPsi)!)
            {
                await corruptProc.WaitForExitAsync();
                Assert.NotEqual(0, corruptProc.ExitCode);
            }

            await using (var verifyAfterCorrupt = new CadenceDbContext(new DbContextOptionsBuilder<CadenceDbContext>()
                .UseSqlite($"Data Source={paths.DatabasePath};Pooling=False").Options))
            {
                var tasks = await verifyAfterCorrupt.Tasks.AsNoTracking().ToListAsync();
                Assert.Single(tasks);
            }
        }
        finally
        {
            if (Directory.Exists(tempRoot))
            {
                Directory.Delete(tempRoot, recursive: true);
            }
        }
    }

    [Fact]
    public async Task SimultaneousApiBackups_ProduceTwoDistinctValidFiles_AndEnforceRetention()
    {
        await using var host = await DisposableBackupHost.CreateAsync(backupRetentionCount: 3);

        await host.Client.PostAsJsonAsync("/api/tasks", new
        {
            title = "Practice Bach Partita",
            category = "Piano",
            priority = 1
        });

        // Fire two simultaneous backup requests
        var t1 = host.Client.PostAsync("/api/system/backup", null);
        var t2 = host.Client.PostAsync("/api/system/backup", null);
        var responses = await Task.WhenAll(t1, t2);

        Assert.All(responses, r => r.EnsureSuccessStatusCode());

        var body1 = await responses[0].Content.ReadFromJsonAsync<JsonElement>();
        var body2 = await responses[1].Content.ReadFromJsonAsync<JsonElement>();

        var path1 = body1.GetProperty("backupPath").GetString()!;
        var path2 = body2.GetProperty("backupPath").GetString()!;

        Assert.NotEqual(path1, path2);
        Assert.True(File.Exists(path1));
        Assert.True(File.Exists(path2));

        // Verify both backup files pass PRAGMA integrity_check and contain our task
        foreach (var backupPath in new[] { path1, path2 })
        {
            await using var conn = new SqliteConnection($"Data Source={backupPath};Mode=ReadOnly;Pooling=False");
            await conn.OpenAsync();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "PRAGMA integrity_check;";
            Assert.Equal("ok", (string?)await cmd.ExecuteScalarAsync());

            await using var countCmd = conn.CreateCommand();
            countCmd.CommandText = "SELECT COUNT(*) FROM Tasks;";
            Assert.Equal(1L, Convert.ToInt64(await countCmd.ExecuteScalarAsync()));
        }

        // Trigger 2 more backups (total 4 created) with retention limit = 3 -> only 3 should remain
        await (await host.Client.PostAsync("/api/system/backup", null)).Content.ReadAsStringAsync();
        await (await host.Client.PostAsync("/api/system/backup", null)).Content.ReadAsStringAsync();

        var remainingBackups = Directory.GetFiles(host.StoragePaths.BackupsDir, "cadence-*.db");
        Assert.Equal(3, remainingBackups.Length);
    }

    [Fact]
    public async Task BackupDirectoriesAndFiles_HavePrivateUnixPermissions()
    {
        if (!OperatingSystem.IsLinux() && !OperatingSystem.IsMacOS())
        {
            return;
        }

        await using var host = await DisposableBackupHost.CreateAsync();

        var res = await host.Client.PostAsync("/api/system/backup", null);
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        var apiBackupPath = body.GetProperty("backupPath").GetString()!;

        var expectedDirMode = UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute; // 0700
        var expectedFileMode = UnixFileMode.UserRead | UnixFileMode.UserWrite; // 0600

        var backupsDirMode = File.GetUnixFileMode(host.StoragePaths.BackupsDir);
        var dbDirMode = File.GetUnixFileMode(host.StoragePaths.DbDir);
        var mediaDirMode = File.GetUnixFileMode(host.StoragePaths.MediaDir);
        var apiBackupFileMode = File.GetUnixFileMode(apiBackupPath);

        Assert.Equal(expectedDirMode, backupsDirMode);
        Assert.Equal(expectedDirMode, dbDirMode);
        Assert.Equal(expectedDirMode, mediaDirMode);
        Assert.Equal(expectedFileMode, apiBackupFileMode);
    }

    [Fact]
    public async Task CustomStorageRoot_IsHonoredByBothApiAndBackupScript_IncludingMediaBackup()
    {
        await using var host = await DisposableBackupHost.CreateAsync();

        // Create a piece and a synthetic score file in the custom MediaDir
        var pieceId = Guid.CreateVersion7();
        var pieceRes = await host.Client.PostAsJsonAsync("/api/pieces", new
        {
            id = pieceId,
            title = "Prelude Op. 28 No. 15",
            composer = "Chopin",
            bucket = "MainChallenge"
        });
        pieceRes.EnsureSuccessStatusCode();

        var scoreDir = Path.Combine(host.StoragePaths.MediaDir, "pieces", pieceId.ToString(), "scores");
        Directory.CreateDirectory(scoreDir);
        var scoreFile = Path.Combine(scoreDir, "score.pdf");
        await File.WriteAllTextAsync(scoreFile, "%PDF-1.7 SYNTHETIC_SCORE");

        // 1. Trigger API backup -> must land in custom StorageRoot/backups
        var apiRes = await host.Client.PostAsync("/api/system/backup", null);
        apiRes.EnsureSuccessStatusCode();
        var apiBody = await apiRes.Content.ReadFromJsonAsync<JsonElement>();
        var apiBackupPath = apiBody.GetProperty("backupPath").GetString()!;
        Assert.StartsWith(host.StoragePaths.BackupsDir, apiBackupPath);
        Assert.True(File.Exists(apiBackupPath));

        // 2. Run deploy/backup-db.sh with CADENCE_STORAGE_ROOT pointing to host.TempRoot
        var backupScript = Path.Combine(GetRepoRoot(), "deploy", "backup-db.sh");
        var psi = new ProcessStartInfo
        {
            FileName = "bash",
            ArgumentList = { backupScript },
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        psi.Environment["CADENCE_STORAGE_ROOT"] = host.TempRoot;

        using (var proc = Process.Start(psi)!)
        {
            var stdout = await proc.StandardOutput.ReadToEndAsync();
            var stderr = await proc.StandardError.ReadToEndAsync();
            await proc.WaitForExitAsync();
            Assert.True(proc.ExitCode == 0, $"backup-db.sh failed ({proc.ExitCode}): {stdout}\n{stderr}");
        }

        // Expect 2 distinct DB backups in host.StoragePaths.BackupsDir (1 from API, 1 from script)
        var dbBackups = Directory.GetFiles(host.StoragePaths.BackupsDir, "cadence-*.db");
        Assert.Equal(2, dbBackups.Length);

        if (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS())
        {
            var expectedFileMode = UnixFileMode.UserRead | UnixFileMode.UserWrite;
            foreach (var backupFile in dbBackups)
            {
                Assert.Equal(expectedFileMode, File.GetUnixFileMode(backupFile));
            }
        }

        // Expect media backup to also exist under host.StoragePaths.BackupsDir/media
        var backedUpScore = Path.Combine(host.StoragePaths.BackupsDir, "media", "pieces", pieceId.ToString(), "scores", "score.pdf");
        Assert.True(File.Exists(backedUpScore), $"Expected backed up media file at {backedUpScore}");
        Assert.Equal("%PDF-1.7 SYNTHETIC_SCORE", await File.ReadAllTextAsync(backedUpScore));
    }
}
