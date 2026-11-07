using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;

namespace Cadence.Api.Infrastructure;

public class PythonAudioDspAnalyzer : IAudioDspAnalyzer
{
    private static readonly SemaphoreSlim ConcurrencyGate = new(2, 2);
    private static readonly TimeSpan AnalysisTimeout = TimeSpan.FromSeconds(30);

    private readonly ILogger<PythonAudioDspAnalyzer> _logger;
    private readonly IConfiguration? _configuration;
    private readonly string? _pythonPathOverride;
    private readonly string? _scriptPathOverride;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public PythonAudioDspAnalyzer(
        ILogger<PythonAudioDspAnalyzer> logger,
        IConfiguration configuration)
        : this(logger, pythonPathOverride: null, scriptPathOverride: null, configuration: configuration)
    {
    }

    public PythonAudioDspAnalyzer(
        ILogger<PythonAudioDspAnalyzer> logger,
        string? pythonPathOverride = null,
        string? scriptPathOverride = null,
        IConfiguration? configuration = null)
    {
        _logger = logger;
        _configuration = configuration;
        _pythonPathOverride = pythonPathOverride;
        _scriptPathOverride = scriptPathOverride;
    }

    public async Task<ObjectiveDspMetrics> AnalyzeAudioAsync(string audioFilePath, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(audioFilePath) || !File.Exists(audioFilePath))
        {
            _logger.LogWarning("Audio file not found for DSP analysis: {Path}", audioFilePath);
            return CreateUnavailableMetrics($"Audio file not found: {audioFilePath}");
        }

        var (pythonPath, scriptPath) = ResolvePaths();
        if (string.IsNullOrWhiteSpace(scriptPath) || !File.Exists(scriptPath))
        {
            _logger.LogWarning("Python DSP analyzer script not found: {Path}", scriptPath);
            return CreateUnavailableMetrics("Python DSP analyzer script not found on disk.");
        }

        await ConcurrencyGate.WaitAsync(ct);
        var tempOutputFile = Path.Combine(Path.GetTempPath(), $"cadence_dsp_{Guid.NewGuid():N}.json");

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = pythonPath,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            psi.ArgumentList.Add(scriptPath);
            psi.ArgumentList.Add(audioFilePath);
            psi.ArgumentList.Add("--output");
            psi.ArgumentList.Add(tempOutputFile);

            var (exitCode, stdout, stderr) = await MediaProcessingService.RunProcessWithTimeoutAsync(psi, AnalysisTimeout, ct);

            if (File.Exists(tempOutputFile))
            {
                var json = await File.ReadAllTextAsync(tempOutputFile, ct);
                var metrics = JsonSerializer.Deserialize<ObjectiveDspMetrics>(json, JsonOptions);
                if (metrics != null)
                {
                    metrics.RawJson = json;
                    return metrics;
                }
            }

            if (!string.IsNullOrWhiteSpace(stdout))
            {
                var metrics = JsonSerializer.Deserialize<ObjectiveDspMetrics>(stdout, JsonOptions);
                if (metrics != null)
                {
                    metrics.RawJson = stdout;
                    return metrics;
                }
            }

            var errSummary = !string.IsNullOrWhiteSpace(stderr) ? stderr : "No JSON output produced.";
            _logger.LogWarning("DSP analyzer process exited with code {Code}: {Error}", exitCode, errSummary);
            return CreateUnavailableMetrics($"Analyzer exited with code {exitCode}: {errSummary}");
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("DSP analysis was cancelled or timed out after 30 seconds for audio: {Path}", audioFilePath);
            return CreateUnavailableMetrics("DSP audio analysis timed out (30s limit exceeded).");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to execute Python DSP audio analysis on {Path}", audioFilePath);
            return CreateUnavailableMetrics($"Execution failed: {ex.Message}");
        }
        finally
        {
            try
            {
                if (File.Exists(tempOutputFile))
                {
                    File.Delete(tempOutputFile);
                }
            }
            catch
            {
                // Ignored
            }
            ConcurrencyGate.Release();
        }
    }

    public (string pythonPath, string scriptPath) ResolvePaths()
    {
        var configuredScript = _scriptPathOverride
            ?? _configuration?["Cadence:DspScriptPath"]
            ?? _configuration?["CADENCE_DSP_SCRIPT"]
            ?? Environment.GetEnvironmentVariable("CADENCE_DSP_SCRIPT");

        var configuredPython = _pythonPathOverride
            ?? _configuration?["Cadence:DspPythonPath"]
            ?? _configuration?["CADENCE_DSP_PYTHON"]
            ?? Environment.GetEnvironmentVariable("CADENCE_DSP_PYTHON");

        var scriptPath = !string.IsNullOrWhiteSpace(configuredScript)
            ? configuredScript
            : Path.Combine(AppContext.BaseDirectory, "tools", "audio_analyzer", "analyze.py");

        if (!string.IsNullOrWhiteSpace(configuredPython))
        {
            return (configuredPython, scriptPath);
        }

        // Check colocated .venv beside the resolved script or inside AppContext.BaseDirectory
        var scriptDir = Path.GetDirectoryName(Path.GetFullPath(scriptPath));
        var pythonCandidates = new List<string>();
        if (!string.IsNullOrWhiteSpace(scriptDir))
        {
            pythonCandidates.Add(Path.Combine(scriptDir, ".venv", "bin", "python"));
        }
        pythonCandidates.Add(Path.Combine(AppContext.BaseDirectory, "tools", "audio_analyzer", ".venv", "bin", "python"));

        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (!string.IsNullOrWhiteSpace(home))
        {
            pythonCandidates.Add(Path.Combine(home, ".local", "share", "cadence", "python-dsp", ".venv", "bin", "python"));
        }

        // Local development / test fallback: if running from bin/Debug/net10.0 inside a repo with tools/audio_analyzer/.venv
        var baseDir = new DirectoryInfo(AppContext.BaseDirectory);
        for (int depth = 0; depth < 6 && baseDir != null; depth++, baseDir = baseDir.Parent)
        {
            pythonCandidates.Add(Path.Combine(baseDir.FullName, "tools", "audio_analyzer", ".venv", "bin", "python"));
        }

        var foundPython = pythonCandidates.FirstOrDefault(File.Exists) ?? "python3";
        return (foundPython, scriptPath);
    }

    private static ObjectiveDspMetrics CreateUnavailableMetrics(string message)
    {
        var safeJson = JsonSerializer.Serialize(new
        {
            analyzerStatus = "Unavailable",
            error = message,
            durationSeconds = 0.0,
            estimatedMeanBpm = 0.0,
            tempoStabilityStdDevBpm = 0.0,
            detectedTempoAnomalies = Array.Empty<object>(),
            dynamicRangeRmsDb = 0.0,
            dynamicEnvelopeNotes = $"DSP analysis unavailable: {message}"
        });

        return new ObjectiveDspMetrics
        {
            AnalyzerStatus = "Unavailable",
            DurationSeconds = 0.0,
            EstimatedMeanBpm = 0.0,
            TempoStabilityStdDevBpm = 0.0,
            DetectedTempoAnomalies = [],
            DynamicRangeRmsDb = 0.0,
            DynamicEnvelopeNotes = $"DSP analysis unavailable: {message}",
            RawJson = safeJson
        };
    }
}
