using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Cadence.Api.Infrastructure;

public class PythonAudioDspAnalyzer : IAudioDspAnalyzer
{
    private static readonly SemaphoreSlim ConcurrencyGate = new(2, 2);
    private static readonly TimeSpan AnalysisTimeout = TimeSpan.FromSeconds(30);

    private readonly ILogger<PythonAudioDspAnalyzer> _logger;
    private readonly string? _pythonPathOverride;
    private readonly string? _scriptPathOverride;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public PythonAudioDspAnalyzer(
        ILogger<PythonAudioDspAnalyzer> logger,
        string? pythonPathOverride = null,
        string? scriptPathOverride = null)
    {
        _logger = logger;
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

    private (string pythonPath, string scriptPath) ResolvePaths()
    {
        if (!string.IsNullOrWhiteSpace(_scriptPathOverride))
        {
            return (_pythonPathOverride ?? "python3", _scriptPathOverride);
        }

        var candidates = new List<string>
        {
            AppContext.BaseDirectory,
            Directory.GetCurrentDirectory()
        };

        // Traverse up parent directories from AppContext.BaseDirectory and CWD
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            candidates.Add(dir.FullName);
            dir = dir.Parent;
        }

        var cwd = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (cwd != null)
        {
            candidates.Add(cwd.FullName);
            cwd = cwd.Parent;
        }

        string? foundScript = null;
        string? foundPython = _pythonPathOverride;

        foreach (var candidate in candidates.Distinct())
        {
            var scriptCandidate = Path.Combine(candidate, "tools", "audio_analyzer", "analyze.py");
            if (File.Exists(scriptCandidate))
            {
                foundScript = scriptCandidate;

                if (foundPython == null)
                {
                    var venvPython = Path.Combine(candidate, "tools", "audio_analyzer", ".venv", "bin", "python");
                    if (File.Exists(venvPython))
                    {
                        foundPython = venvPython;
                    }
                }
                break;
            }
        }

        foundScript ??= Path.Combine(Directory.GetCurrentDirectory(), "tools", "audio_analyzer", "analyze.py");
        foundPython ??= "python3";

        return (foundPython, foundScript);
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
