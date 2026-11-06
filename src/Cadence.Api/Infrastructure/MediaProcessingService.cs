using System.Diagnostics;
using System.Globalization;
using Cadence.Api.Domain.PianoMentor;

namespace Cadence.Api.Infrastructure;

public interface IMediaProcessingService
{
    Task<string> SaveScorePdfAsync(Guid pieceId, Stream fileStream, CancellationToken cancellationToken = default);
    Task<ProcessedTakeMedia> ProcessUploadedTakeAsync(
        Guid pieceId,
        Guid sessionId,
        int takeNumber,
        string originalFileName,
        Stream fileStream,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<byte[]>> ExtractVideoPostureFramesAsync(
        string videoRelativePath,
        int maxFrames = 4,
        CancellationToken cancellationToken = default);
    string GetFullPath(string relativePath);
    bool FileExists(string relativePath);
}

public record ProcessedTakeMedia(
    string OriginalRelativePath,
    string ExtractedAudioRelativePath,
    OriginalMediaType OriginalMediaType,
    double? DurationSeconds
);

public class MediaProcessingService : IMediaProcessingService
{
    private readonly CadenceStoragePaths _paths;
    private readonly ILogger<MediaProcessingService> _logger;

    public MediaProcessingService(CadenceStoragePaths paths, ILogger<MediaProcessingService> logger)
    {
        _paths = paths;
        _logger = logger;
    }

    public string GetFullPath(string relativePath)
    {
        // Prevent path traversal
        var normalized = relativePath.Replace('\\', '/').TrimStart('/');
        if (normalized.Contains(".."))
        {
            throw new ArgumentException("Invalid path traversal sequence detected.");
        }
        return Path.Combine(_paths.MediaDir, normalized);
    }

    public bool FileExists(string relativePath)
    {
        return File.Exists(GetFullPath(relativePath));
    }

    public async Task<string> SaveScorePdfAsync(Guid pieceId, Stream fileStream, CancellationToken cancellationToken = default)
    {
        var relativeDir = Path.Combine("pieces", pieceId.ToString(), "scores");
        var absoluteDir = Path.Combine(_paths.MediaDir, relativeDir);
        Directory.CreateDirectory(absoluteDir);

        var relativePath = Path.Combine(relativeDir, "score.pdf");
        var absolutePath = Path.Combine(_paths.MediaDir, relativePath);

        await using var output = File.Create(absolutePath);
        await fileStream.CopyToAsync(output, cancellationToken);

        _logger.LogInformation("Saved piece score PDF at {Path}", absolutePath);
        return relativePath.Replace('\\', '/');
    }

    public async Task<ProcessedTakeMedia> ProcessUploadedTakeAsync(
        Guid pieceId,
        Guid sessionId,
        int takeNumber,
        string originalFileName,
        Stream fileStream,
        CancellationToken cancellationToken = default)
    {
        var relativeDir = Path.Combine("pieces", pieceId.ToString(), "sessions", sessionId.ToString());
        var absoluteDir = Path.Combine(_paths.MediaDir, relativeDir);
        Directory.CreateDirectory(absoluteDir);

        var ext = Path.GetExtension(originalFileName).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(ext))
        {
            ext = ".mp4";
        }

        var isVideo = ext is ".mp4" or ".mov" or ".mkv" or ".webm";
        var mediaType = isVideo ? OriginalMediaType.VideoMp4 : OriginalMediaType.AudioMp3;

        var origRelativePath = Path.Combine(relativeDir, $"take_{takeNumber}_orig{ext}").Replace('\\', '/');
        var origAbsolutePath = GetFullPath(origRelativePath);

        // Save original file to disk
        await using (var output = File.Create(origAbsolutePath))
        {
            await fileStream.CopyToAsync(output, cancellationToken);
        }

        string extractedAudioRelativePath;
        if (isVideo || ext != ".mp3")
        {
            extractedAudioRelativePath = Path.Combine(relativeDir, $"take_{takeNumber}_audio.mp3").Replace('\\', '/');
            var extractedAudioAbsolutePath = GetFullPath(extractedAudioRelativePath);

            try
            {
                await ExtractAudioWithFfmpegAsync(origAbsolutePath, extractedAudioAbsolutePath, cancellationToken);
            }
            catch (Exception ex) when (!isVideo)
            {
                // For non-MP3 audio files (e.g., .wav) where FFmpeg might not be installed in a minimal environment,
                // fall back gracefully to the original audio file so DSP (soundfile) and playback still work.
                _logger.LogWarning(ex, "FFmpeg transcode of audio {Ext} failed; falling back to original audio file.", ext);
                extractedAudioRelativePath = origRelativePath;
            }
        }
        else
        {
            // Already an MP3 audio file
            extractedAudioRelativePath = origRelativePath;
        }

        // Probe duration
        var durationSeconds = await ProbeDurationSecondsAsync(origAbsolutePath, cancellationToken);

        return new ProcessedTakeMedia(
            origRelativePath,
            extractedAudioRelativePath,
            mediaType,
            durationSeconds
        );
    }

    public virtual async Task<IReadOnlyList<byte[]>> ExtractVideoPostureFramesAsync(
        string videoRelativePath,
        int maxFrames = 4,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(videoRelativePath) || maxFrames <= 0)
        {
            return [];
        }

        var videoFullPath = GetFullPath(videoRelativePath);
        if (!File.Exists(videoFullPath))
        {
            return [];
        }

        var duration = await ProbeDurationSecondsAsync(videoFullPath, cancellationToken) ?? 12.0;
        var tempDir = Path.Combine(Path.GetTempPath(), $"cadence_frames_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        try
        {
            var interval = Math.Max(1.0, duration / (maxFrames + 1));
            var frames = new List<byte[]>(maxFrames);

            for (int i = 1; i <= maxFrames; i++)
            {
                var timestampSec = Math.Min(Math.Max(0.0, duration - 0.2), i * interval);
                var framePath = Path.Combine(tempDir, $"frame_{i}.jpg");
                var tsFormatted = timestampSec.ToString("F2", CultureInfo.InvariantCulture);

                var startInfo = new ProcessStartInfo
                {
                    FileName = "ffmpeg",
                    Arguments = $"-y -ss {tsFormatted} -i \"{videoFullPath}\" -frames:v 1 -vf \"scale='min(1280,iw)':-2\" -q:v 4 \"{framePath}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = new Process { StartInfo = startInfo };
                process.Start();
                var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
                await process.WaitForExitAsync(cancellationToken);
                await stderrTask;

                if (process.ExitCode == 0 && File.Exists(framePath))
                {
                    frames.Add(await File.ReadAllBytesAsync(framePath, cancellationToken));
                }
            }

            return frames;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not extract video posture frames for {VideoPath}", videoFullPath);
            return [];
        }
        finally
        {
            try
            {
                if (Directory.Exists(tempDir))
                {
                    Directory.Delete(tempDir, recursive: true);
                }
            }
            catch
            {
                // Ignored
            }
        }
    }

    private async Task ExtractAudioWithFfmpegAsync(string inputPath, string outputMp3Path, CancellationToken cancellationToken)
    {
        // Command: ffmpeg -y -i "{inputPath}" -vn -ac 1 -ar 24000 -b:a 96k "{outputMp3Path}"
        var startInfo = new ProcessStartInfo
        {
            FileName = "ffmpeg",
            Arguments = $"-y -i \"{inputPath}\" -vn -ac 1 -ar 24000 -b:a 96k \"{outputMp3Path}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = new Process { StartInfo = startInfo };
        try
        {
            process.Start();
            var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
            await process.WaitForExitAsync(cancellationToken);
            var stderr = await stderrTask;

            if (process.ExitCode != 0)
            {
                _logger.LogError("FFmpeg audio extraction failed (exit code {ExitCode}): {Error}", process.ExitCode, stderr);
                throw new InvalidOperationException($"FFmpeg audio extraction failed: {stderr}");
            }

            _logger.LogInformation("Successfully extracted mono audio to {OutputMp3Path}", outputMp3Path);
        }
        catch (Exception ex) when (ex is not InvalidOperationException)
        {
            _logger.LogError(ex, "Failed to execute FFmpeg process.");
            throw;
        }
    }

    private async Task<double?> ProbeDurationSecondsAsync(string inputPath, CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "ffprobe",
            Arguments = $"-v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"{inputPath}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = new Process { StartInfo = startInfo };
        try
        {
            process.Start();
            var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
            await process.WaitForExitAsync(cancellationToken);
            var stdout = await stdoutTask;

            if (process.ExitCode == 0 && double.TryParse(stdout.Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out var duration))
            {
                return duration;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not probe media duration with ffprobe for {Path}", inputPath);
        }

        return null;
    }
}
