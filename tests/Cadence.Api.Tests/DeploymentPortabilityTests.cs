using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Cadence.Api.Infrastructure;
using Microsoft.Extensions.Configuration;
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
}
