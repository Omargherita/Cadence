using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Cadence.Api.Features.MusicalLibrary;
using Cadence.Api.Features.Organizer;
using Cadence.Api.Features.PianoMentor;
using Cadence.Api.Features.System;
using Cadence.Api.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace Cadence.Api.Tests;

public class DeploymentPortabilityTests
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

    private static byte[] CreateSyntheticWavBytes(int sampleRate, double durationSeconds)
    {
        int numSamples = (int)(sampleRate * durationSeconds);
        using var ms = new MemoryStream();
        using var bw = new BinaryWriter(ms, Encoding.ASCII, leaveOpen: true);

        bw.Write(Encoding.ASCII.GetBytes("RIFF"));
        bw.Write(36 + numSamples * 2);
        bw.Write(Encoding.ASCII.GetBytes("WAVE"));
        bw.Write(Encoding.ASCII.GetBytes("fmt "));
        bw.Write(16);
        bw.Write((short)1);
        bw.Write((short)1);
        bw.Write(sampleRate);
        bw.Write(sampleRate * 2);
        bw.Write((short)2);
        bw.Write((short)16);
        bw.Write(Encoding.ASCII.GetBytes("data"));
        bw.Write(numSamples * 2);

        for (int i = 0; i < numSamples; i++)
        {
            double t = (double)i / sampleRate;
            double sample = Math.Sin(2 * Math.PI * 440.0 * t) * 0.5;
            bw.Write((short)(sample * short.MaxValue));
        }

        bw.Flush();
        return ms.ToArray();
    }

    [Fact]
    public async Task PublishedOutput_IncludesDspWorker_AndAnalyzerFindsWorkerViaExplicitConfigOutsideCheckout()
    {
        var repoRoot = GetRepoRoot();
        var tempRoot = Path.Combine(Path.GetTempPath(), $"cadence_batch5_pub_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempRoot);

        try
        {
            // 1. Verify build/publish output contains tools/audio_analyzer/analyze.py alongside Cadence.Api.dll
            var bundledScriptInTestBin = Path.Combine(AppContext.BaseDirectory, "tools", "audio_analyzer", "analyze.py");
            Assert.True(File.Exists(bundledScriptInTestBin),
                $"Expected analyze.py to be copied into build/publish output at {bundledScriptInTestBin}");

            // 2. Copy the bundled script to an isolated directory outside the repo checkout and verify explicit IConfiguration resolves it
            var isolatedInstallDir = Path.Combine(tempRoot, "isolated_release");
            var isolatedDspDir = Path.Combine(isolatedInstallDir, "tools", "audio_analyzer");
            Directory.CreateDirectory(isolatedDspDir);

            var isolatedScript = Path.Combine(isolatedDspDir, "analyze.py");
            await File.WriteAllTextAsync(isolatedScript, @"
import json, sys
out_idx = sys.argv.index('--output') + 1 if '--output' in sys.argv else -1
payload = {
    'analyzerStatus': 'Available',
    'durationSeconds': 3.5,
    'estimatedMeanBpm': 112.0,
    'tempoStabilityStdDevBpm': 1.1,
    'detectedTempoAnomalies': [],
    'dynamicRangeRmsDb': 16.4,
    'dynamicEnvelopeNotes': 'Resolved from explicit config outside checkout'
}
if out_idx > 0:
    with open(sys.argv[out_idx], 'w') as f:
        json.dump(payload, f)
print(json.dumps(payload))
");

            var audioFile = Path.Combine(tempRoot, "synth.wav");
            await File.WriteAllBytesAsync(audioFile, CreateSyntheticWavBytes(24000, 0.5));

            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Cadence:DspPythonPath"] = "python3",
                    ["Cadence:DspScriptPath"] = isolatedScript
                })
                .Build();

            // Construct PythonAudioDspAnalyzer using IConfiguration (production DI constructor)
            var ctor = typeof(PythonAudioDspAnalyzer).GetConstructor([typeof(Microsoft.Extensions.Logging.ILogger<PythonAudioDspAnalyzer>), typeof(IConfiguration)]);
            Assert.NotNull(ctor);
            var analyzer = (PythonAudioDspAnalyzer)ctor!.Invoke([NullLogger<PythonAudioDspAnalyzer>.Instance, config]);

            var metrics = await analyzer.AnalyzeAudioAsync(audioFile);
            Assert.Equal("Available", metrics.AnalyzerStatus);
            Assert.Equal(112.0, metrics.EstimatedMeanBpm);
            Assert.Contains("Resolved from explicit config outside checkout", metrics.DynamicEnvelopeNotes);
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
    public async Task StagedReleaseBuild_PreservesActiveReleaseWhenBuildFails_AndSupportsRollback()
    {
        var repoRoot = GetRepoRoot();
        var buildScript = Path.Combine(repoRoot, "deploy", "build-release.sh");
        var rollbackScript = Path.Combine(repoRoot, "deploy", "rollback-release.sh");

        Assert.True(File.Exists(buildScript), "Expected deploy/build-release.sh");
        Assert.True(File.Exists(rollbackScript), "Expected deploy/rollback-release.sh");

        var tempDeployRoot = Path.Combine(Path.GetTempPath(), $"cadence_batch5_stage_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDeployRoot);

        try
        {
            // Seed two synthetic releases (release-v1 and release-v2) inside tempDeployRoot
            var releasesDir = Path.Combine(tempDeployRoot, "releases");
            var rel1 = Path.Combine(releasesDir, "release-20261107_100000-v1");
            var rel2 = Path.Combine(releasesDir, "release-20261107_110000-v2");
            Directory.CreateDirectory(Path.Combine(rel1, "wwwroot"));
            Directory.CreateDirectory(Path.Combine(rel1, "tools", "audio_analyzer"));
            await File.WriteAllTextAsync(Path.Combine(rel1, "Cadence.Api"), "#!/bin/sh\necho v1\n");
            await File.WriteAllTextAsync(Path.Combine(rel1, "wwwroot", "index.html"), "<html>v1</html>");
            await File.WriteAllTextAsync(Path.Combine(rel1, "tools", "audio_analyzer", "analyze.py"), "# v1");

            Directory.CreateDirectory(Path.Combine(rel2, "wwwroot"));
            Directory.CreateDirectory(Path.Combine(rel2, "tools", "audio_analyzer"));
            await File.WriteAllTextAsync(Path.Combine(rel2, "Cadence.Api"), "#!/bin/sh\necho v2\n");
            await File.WriteAllTextAsync(Path.Combine(rel2, "wwwroot", "index.html"), "<html>v2</html>");
            await File.WriteAllTextAsync(Path.Combine(rel2, "tools", "audio_analyzer", "analyze.py"), "# v2");

            var currentLink = Path.Combine(tempDeployRoot, "current");
            var previousLink = Path.Combine(tempDeployRoot, "previous");
            var publishLink = Path.Combine(tempDeployRoot, "publish");

            File.CreateSymbolicLink(previousLink, rel1);
            File.CreateSymbolicLink(currentLink, rel2);
            File.CreateSymbolicLink(publishLink, rel2);

            // 1. Run build-release.sh with a deliberately failing dotnet command and CADENCE_DEPLOY_DIR=tempDeployRoot
            var failPsi = new ProcessStartInfo
            {
                FileName = "bash",
                ArgumentList = { buildScript },
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };
            failPsi.Environment["CADENCE_DEPLOY_DIR"] = tempDeployRoot;
            failPsi.Environment["CADENCE_SKIP_FRONTEND_BUILD"] = "1";
            failPsi.Environment["CADENCE_SKIP_VENV_SETUP"] = "1";
            failPsi.Environment["DOTNET_BIN"] = "/bin/false";

            using (var failProc = Process.Start(failPsi)!)
            {
                await failProc.WaitForExitAsync();
                Assert.NotEqual(0, failProc.ExitCode);
            }

            // Active release (current & publish) must still point to rel2 and its contents must be intact!
            Assert.True(File.Exists( Path.Combine(currentLink, "Cadence.Api")));
            Assert.Equal("<html>v2</html>", await File.ReadAllTextAsync(Path.Combine(currentLink, "wwwroot", "index.html")));
            Assert.Equal("<html>v2</html>", await File.ReadAllTextAsync(Path.Combine(publishLink, "wwwroot", "index.html")));

            // 2. Run rollback-release.sh and verify current switches atomically back to rel1
            var rollbackPsi = new ProcessStartInfo
            {
                FileName = "bash",
                ArgumentList = { rollbackScript },
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };
            rollbackPsi.Environment["CADENCE_DEPLOY_DIR"] = tempDeployRoot;

            using (var rbProc = Process.Start(rollbackPsi)!)
            {
                var stdout = await rbProc.StandardOutput.ReadToEndAsync();
                var stderr = await rbProc.StandardError.ReadToEndAsync();
                await rbProc.WaitForExitAsync();
                Assert.True(rbProc.ExitCode == 0, $"rollback-release.sh failed: {stdout}\n{stderr}");
            }

            Assert.Equal("<html>v1</html>", await File.ReadAllTextAsync(Path.Combine(currentLink, "wwwroot", "index.html")));
            Assert.Equal("<html>v1</html>", await File.ReadAllTextAsync(Path.Combine(publishLink, "wwwroot", "index.html")));
        }
        finally
        {
            if (Directory.Exists(tempDeployRoot))
            {
                Directory.Delete(tempDeployRoot, recursive: true);
            }
        }
    }

    [Fact]
    public async Task SystemdUnits_BindLoopbackIncludeEnvironmentFile_AndPassSystemdAnalyzeVerify()
    {
        var repoRoot = GetRepoRoot();
        var servicePath = Path.Combine(repoRoot, "deploy", "systemd", "cadence.service");
        var installScript = Path.Combine(repoRoot, "deploy", "install-systemd.sh");
        var envExamplePath = Path.Combine(repoRoot, ".env.example");
        var runsettingsPath = Path.Combine(repoRoot, ".runsettings");

        Assert.True(File.Exists(envExamplePath), "Expected .env.example in repo root");

        var serviceContent = await File.ReadAllTextAsync(servicePath);
        Assert.Contains("127.0.0.1:5006", serviceContent);
        Assert.DoesNotContain("0.0.0.0:5006", serviceContent);
        Assert.Contains("EnvironmentFile=-%h/.config/cadence/cadence.env", serviceContent);
        Assert.DoesNotContain("/home/omar", serviceContent);

        var runsettingsContent = await File.ReadAllTextAsync(runsettingsPath);
        Assert.DoesNotContain("/home/omar", runsettingsContent);

        // Render units into a disposable directory via install-systemd.sh --render-only and verify with systemd-analyze
        var tempSystemdDir = Path.Combine(Path.GetTempPath(), $"cadence_systemd_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempSystemdDir);
        try
        {
            var installRoot = Path.Combine(tempSystemdDir, "app");
            Directory.CreateDirectory(Path.Combine(installRoot, "deploy", "current"));
            var dummyApi = Path.Combine(installRoot, "deploy", "current", "Cadence.Api");
            var dummyBackup = Path.Combine(installRoot, "deploy", "backup-db.sh");
            await File.WriteAllTextAsync(dummyApi, "#!/bin/sh\nexit 0\n");
            await File.WriteAllTextAsync(dummyBackup, "#!/bin/sh\nexit 0\n");
            if (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS())
            {
                File.SetUnixFileMode(dummyApi, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
                File.SetUnixFileMode(dummyBackup, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            }

            var renderPsi = new ProcessStartInfo
            {
                FileName = "bash",
                ArgumentList = { installScript, "--render-only" },
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false
            };
            renderPsi.Environment["CADENCE_SYSTEMD_USER_DIR"] = tempSystemdDir;
            renderPsi.Environment["CADENCE_ENV_FILE"] = Path.Combine(tempSystemdDir, "cadence.env");
            renderPsi.Environment["CADENCE_INSTALL_ROOT"] = installRoot;

            using (var proc = Process.Start(renderPsi)!)
            {
                var stdout = await proc.StandardOutput.ReadToEndAsync();
                var stderr = await proc.StandardError.ReadToEndAsync();
                await proc.WaitForExitAsync();
                Assert.True(proc.ExitCode == 0, $"install-systemd.sh --render-only failed: {stdout}\n{stderr}");
            }

            Assert.True(File.Exists(Path.Combine(tempSystemdDir, "cadence.service")));
            Assert.True(File.Exists(Path.Combine(tempSystemdDir, "cadence-backup.service")));
            Assert.True(File.Exists(Path.Combine(tempSystemdDir, "cadence-backup.timer")));
            Assert.True(File.Exists(Path.Combine(tempSystemdDir, "cadence.env")));

            if (OperatingSystem.IsLinux())
            {
                var verifyPsi = new ProcessStartInfo
                {
                    FileName = "systemd-analyze",
                    ArgumentList =
                    {
                        "--user",
                        "verify",
                        Path.Combine(tempSystemdDir, "cadence.service"),
                        Path.Combine(tempSystemdDir, "cadence-backup.service"),
                        Path.Combine(tempSystemdDir, "cadence-backup.timer")
                    },
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false
                };
                using var verifyProc = Process.Start(verifyPsi)!;
                var vOut = await verifyProc.StandardOutput.ReadToEndAsync();
                var vErr = await verifyProc.StandardError.ReadToEndAsync();
                await verifyProc.WaitForExitAsync();
                Assert.True(verifyProc.ExitCode == 0, $"systemd-analyze --user verify failed ({verifyProc.ExitCode}): {vOut}\n{vErr}");
            }
        }
        finally
        {
            if (Directory.Exists(tempSystemdDir))
            {
                Directory.Delete(tempSystemdDir, recursive: true);
            }
        }
    }

    [Fact]
    public async Task OriginGuardMiddleware_AllowsSameOriginAndAllowList_AndRejectsForeignOriginOnMutatingAndUploadRoutes()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"cadence_origin_test_{Guid.NewGuid():N}");
        try
        {
            await using var host = await CreateOriginTestHostAsync(
                tempRoot,
                allowedOrigins: "https://arch-box.tailnet-xyz.ts.net,http://custom-allowed.local:8080",
                enableOriginCheck: true);

            var baseUri = host.Client.BaseAddress!;
            var sameOrigin = $"{baseUri.Scheme}://{baseUri.Authority}";
            const string foreignOrigin = "https://malicious.example.com";
            const string allowListedOrigin = "https://arch-box.tailnet-xyz.ts.net";

            // 1. No Origin header on POST -> allowed (201 Created)
            var noOriginRes = await SendWithOriginAsync(
                host.Client,
                HttpMethod.Post,
                "/api/tasks",
                origin: null,
                jsonPayload: new { title = "No Origin Task", category = "Piano", priority = 1 });
            Assert.Equal(System.Net.HttpStatusCode.Created, noOriginRes.StatusCode);
            var createdTask = await System.Net.Http.Json.HttpContentJsonExtensions.ReadFromJsonAsync<JsonElement>(noOriginRes.Content);
            var taskId = createdTask.GetProperty("id").GetGuid();

            // 2. Matching Origin header on POST -> allowed (201 Created)
            var pieceId = Guid.CreateVersion7();
            var sameOriginRes = await SendWithOriginAsync(
                host.Client,
                HttpMethod.Post,
                "/api/pieces",
                origin: sameOrigin,
                jsonPayload: new { id = pieceId, title = "Ballade No. 4", composer = "Chopin", bucket = "MainChallenge" });
            Assert.Equal(System.Net.HttpStatusCode.Created, sameOriginRes.StatusCode);

            var sessionId = Guid.CreateVersion7();
            var sessionRes = await SendWithOriginAsync(
                host.Client,
                HttpMethod.Post,
                $"/api/pieces/{pieceId}/sessions",
                origin: sameOrigin,
                jsonPayload: new { id = sessionId, durationMinutes = 25, targetSection = "Coda" });
            Assert.Equal(System.Net.HttpStatusCode.Created, sessionRes.StatusCode);

            // 3. Matching via X-Forwarded-Host -> allowed (201 Created)
            using (var fwdReq = new HttpRequestMessage(HttpMethod.Post, "/api/tasks")
            {
                Content = System.Net.Http.Json.JsonContent.Create(new { title = "Forwarded Host Task", category = "Piano", priority = 2 })
            })
            {
                fwdReq.Headers.TryAddWithoutValidation("Origin", "https://my-proxy.tailnet.ts.net");
                fwdReq.Headers.TryAddWithoutValidation("X-Forwarded-Host", "my-proxy.tailnet.ts.net");
                var fwdRes = await host.Client.SendAsync(fwdReq);
                Assert.Equal(System.Net.HttpStatusCode.Created, fwdRes.StatusCode);
            }

            // 4. Foreign Origin rejected with 403 on POST, PUT, PATCH, DELETE
            var postForeign = await SendWithOriginAsync(
                host.Client,
                HttpMethod.Post,
                "/api/tasks",
                origin: foreignOrigin,
                jsonPayload: new { title = "Evil Task", category = "Piano", priority = 1 });
            Assert.Equal(System.Net.HttpStatusCode.Forbidden, postForeign.StatusCode);
            Assert.Contains(host.LoggedWarnings, msg => msg.Contains(foreignOrigin));

            var putForeign = await SendWithOriginAsync(
                host.Client,
                HttpMethod.Put,
                $"/api/tasks/{taskId}",
                origin: foreignOrigin,
                jsonPayload: new { title = "Evil Edit", category = "Piano", priority = 1, recurrence = "None" });
            Assert.Equal(System.Net.HttpStatusCode.Forbidden, putForeign.StatusCode);

            var patchForeign = await SendWithOriginAsync(
                host.Client,
                HttpMethod.Patch,
                $"/api/tasks/{taskId}/toggle",
                origin: foreignOrigin,
                jsonPayload: new { clientDate = "2026-11-07" });
            Assert.Equal(System.Net.HttpStatusCode.Forbidden, patchForeign.StatusCode);

            var deleteForeign = await SendWithOriginAsync(
                host.Client,
                HttpMethod.Delete,
                $"/api/tasks/{taskId}",
                origin: foreignOrigin);
            Assert.Equal(System.Net.HttpStatusCode.Forbidden, deleteForeign.StatusCode);

            // 5. Foreign Origin still allowed on GET
            var getForeign = await SendWithOriginAsync(
                host.Client,
                HttpMethod.Get,
                "/api/tasks",
                origin: foreignOrigin);
            Assert.Equal(System.Net.HttpStatusCode.OK, getForeign.StatusCode);

            // 6. Allow-list entry works on mutating request
            var allowListedRes = await SendWithOriginAsync(
                host.Client,
                HttpMethod.Patch,
                $"/api/tasks/{taskId}/toggle",
                origin: allowListedOrigin,
                jsonPayload: new { clientDate = "2026-11-07" });
            Assert.Equal(System.Net.HttpStatusCode.OK, allowListedRes.StatusCode);

            // 7. Multipart upload endpoints (/score and /takes): foreign Origin rejected (403), allow-listed Origin accepted
            using (var badScoreForm = new MultipartFormDataContent())
            {
                var pdfBytes = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
                var pdfContent = new ByteArrayContent(pdfBytes);
                pdfContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
                badScoreForm.Add(pdfContent, "file", "score.pdf");

                using var badScoreReq = new HttpRequestMessage(HttpMethod.Post, $"/api/pieces/{pieceId}/score") { Content = badScoreForm };
                badScoreReq.Headers.TryAddWithoutValidation("Origin", foreignOrigin);
                var badScoreRes = await host.Client.SendAsync(badScoreReq);
                Assert.Equal(System.Net.HttpStatusCode.Forbidden, badScoreRes.StatusCode);
            }

            using (var goodScoreForm = new MultipartFormDataContent())
            {
                var pdfBytes = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
                var pdfContent = new ByteArrayContent(pdfBytes);
                pdfContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
                goodScoreForm.Add(pdfContent, "file", "score.pdf");

                using var goodScoreReq = new HttpRequestMessage(HttpMethod.Post, $"/api/pieces/{pieceId}/score") { Content = goodScoreForm };
                goodScoreReq.Headers.TryAddWithoutValidation("Origin", allowListedOrigin);
                var goodScoreRes = await host.Client.SendAsync(goodScoreReq);
                Assert.Equal(System.Net.HttpStatusCode.OK, goodScoreRes.StatusCode);
            }

            using (var badTakeForm = new MultipartFormDataContent())
            {
                var wavBytes = CreateSyntheticWavBytes(24000, 0.3);
                var wavContent = new ByteArrayContent(wavBytes);
                wavContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("audio/wav");
                badTakeForm.Add(wavContent, "file", "take.wav");
                badTakeForm.Add(new StringContent("PassageClip"), "scope");

                using var badTakeReq = new HttpRequestMessage(HttpMethod.Post, $"/api/pieces/{pieceId}/sessions/{sessionId}/takes") { Content = badTakeForm };
                badTakeReq.Headers.TryAddWithoutValidation("Origin", foreignOrigin);
                var badTakeRes = await host.Client.SendAsync(badTakeReq);
                Assert.Equal(System.Net.HttpStatusCode.Forbidden, badTakeRes.StatusCode);
            }

            using (var goodTakeForm = new MultipartFormDataContent())
            {
                var wavBytes = CreateSyntheticWavBytes(24000, 0.3);
                var wavContent = new ByteArrayContent(wavBytes);
                wavContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("audio/wav");
                goodTakeForm.Add(wavContent, "file", "take.wav");
                goodTakeForm.Add(new StringContent("PassageClip"), "scope");

                using var goodTakeReq = new HttpRequestMessage(HttpMethod.Post, $"/api/pieces/{pieceId}/sessions/{sessionId}/takes") { Content = goodTakeForm };
                goodTakeReq.Headers.TryAddWithoutValidation("Origin", allowListedOrigin);
                var goodTakeRes = await host.Client.SendAsync(goodTakeReq);
                Assert.Equal(System.Net.HttpStatusCode.Created, goodTakeRes.StatusCode);
            }

            // 8. Disabling via Cadence:EnableOriginCheck=false allows foreign Origin
            var disabledRoot = Path.Combine(tempRoot, "disabled_host");
            await using var disabledHost = await CreateOriginTestHostAsync(
                disabledRoot,
                allowedOrigins: null,
                enableOriginCheck: false);

            var bypassRes = await SendWithOriginAsync(
                disabledHost.Client,
                HttpMethod.Post,
                "/api/tasks",
                origin: foreignOrigin,
                jsonPayload: new { title = "Allowed When Disabled", category = "Piano", priority = 1 });
            Assert.Equal(System.Net.HttpStatusCode.Created, bypassRes.StatusCode);
        }
        finally
        {
            if (Directory.Exists(tempRoot))
            {
                Directory.Delete(tempRoot, recursive: true);
            }
        }
    }

    private static async Task<HttpResponseMessage> SendWithOriginAsync(
        HttpClient client,
        HttpMethod method,
        string path,
        string? origin,
        object? jsonPayload = null)
    {
        using var req = new HttpRequestMessage(method, path);
        if (origin != null)
        {
            req.Headers.TryAddWithoutValidation("Origin", origin);
        }
        if (jsonPayload != null)
        {
            req.Content = System.Net.Http.Json.JsonContent.Create(jsonPayload);
        }
        return await client.SendAsync(req);
    }

    private sealed class OriginTestHost(
        Microsoft.AspNetCore.Builder.WebApplication app,
        HttpClient client,
        List<string> loggedWarnings) : IAsyncDisposable
    {
        public Microsoft.AspNetCore.Builder.WebApplication App { get; } = app;
        public HttpClient Client { get; } = client;
        public List<string> LoggedWarnings { get; } = loggedWarnings;

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await App.StopAsync();
            await App.DisposeAsync();
        }
    }

    private sealed class ListWarningLoggerProvider(List<string> sink) : Microsoft.Extensions.Logging.ILoggerProvider
    {
        public Microsoft.Extensions.Logging.ILogger CreateLogger(string categoryName) => new ListWarningLogger(sink);
        public void Dispose() { }

        private sealed class ListWarningLogger(List<string> sink) : Microsoft.Extensions.Logging.ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(Microsoft.Extensions.Logging.LogLevel logLevel) => logLevel >= Microsoft.Extensions.Logging.LogLevel.Warning;
            public void Log<TState>(
                Microsoft.Extensions.Logging.LogLevel logLevel,
                Microsoft.Extensions.Logging.EventId eventId,
                TState state,
                Exception? exception,
                Func<TState, Exception?, string> formatter)
            {
                if (logLevel >= Microsoft.Extensions.Logging.LogLevel.Warning)
                {
                    lock (sink)
                    {
                        sink.Add(formatter(state, exception));
                    }
                }
            }
        }
    }

    private static async Task<OriginTestHost> CreateOriginTestHostAsync(
        string storageRoot,
        string? allowedOrigins,
        bool enableOriginCheck)
    {
        var storagePaths = new CadenceStoragePaths(storageRoot);
        storagePaths.EnsureDirectoriesCreated();

        var warnings = new List<string>();
        var builder = Microsoft.AspNetCore.Builder.WebApplication.CreateBuilder(new Microsoft.AspNetCore.Builder.WebApplicationOptions
        {
            Args = ["--urls", "http://127.0.0.1:0"]
        });
        builder.Logging.ClearProviders();
        builder.Logging.AddProvider(new ListWarningLoggerProvider(warnings));

        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Cadence:StorageRoot"] = storageRoot,
            ["Cadence:AllowedOrigins"] = allowedOrigins,
            ["Cadence:EnableOriginCheck"] = enableOriginCheck ? "true" : "false"
        });

        builder.Services.AddSingleton(storagePaths);
        builder.Services.AddSingleton<SqlitePragmaConnectionInterceptor>();
        builder.Services.AddDbContext<CadenceDbContext>((sp, options) =>
        {
            var interceptor = sp.GetRequiredService<SqlitePragmaConnectionInterceptor>();
            options.UseSqlite($"Data Source={storagePaths.DatabasePath};Pooling=False")
                   .AddInterceptors(interceptor);
        });
        builder.Services.AddHttpClient();
        builder.Services.AddSingleton<IMediaProcessingService, MediaProcessingService>();
        builder.Services.AddSingleton<IAudioDspAnalyzer>(new FastNoOpDspAnalyzer());
        builder.Services.AddScoped<Cadence.Api.Features.PianoMentor.IPianoMentorService, Cadence.Api.Features.PianoMentor.PianoMentorService>();
        builder.Services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
            options.SerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
        });

        var app = builder.Build();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CadenceDbContext>();
            await DatabaseSchema.InitializeAsync(db);
        }

        // Note: SameOriginMutationGuardMiddleware is NOT wired yet in this test before Program.cs / middleware activation!
        // We only wire it when the production registration in Program.cs is present.
        var programSource = await File.ReadAllTextAsync(Path.Combine(GetRepoRoot(), "src", "Cadence.Api", "Program.cs"));
        if (programSource.Contains("SameOriginMutationGuardMiddleware", StringComparison.Ordinal))
        {
            app.UseMiddleware<SameOriginMutationGuardMiddleware>();
        }

        app.MapSystemEndpoints();
        app.MapTaskEndpoints();
        app.MapMusicalLibraryEndpoints();
        app.MapDomainEditingEndpoints();
        app.MapPianoMentorEndpoints();
        app.MapMediaStreamEndpoints();

        await app.StartAsync();
        var client = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
        return new OriginTestHost(app, client, warnings);
    }

    private sealed class FastNoOpDspAnalyzer : IAudioDspAnalyzer
    {
        public Task<ObjectiveDspMetrics> AnalyzeAudioAsync(string audioFilePath, CancellationToken ct = default) =>
            Task.FromResult(new ObjectiveDspMetrics
            {
                AnalyzerStatus = "Available",
                DurationSeconds = 1.0,
                EstimatedMeanBpm = 120.0,
                RawJson = "{\"analyzerStatus\":\"Available\"}"
            });
    }
}
