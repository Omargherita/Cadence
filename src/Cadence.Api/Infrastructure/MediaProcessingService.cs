using System.Diagnostics;
using System.Globalization;
using System.Text;
using Cadence.Api.Domain.PianoMentor;

namespace Cadence.Api.Infrastructure;

public sealed class InvalidMediaException(string message) : Exception(message);

public interface IMediaProcessingService
{
    Task<string> SaveScorePdfAsync(Guid pieceId, Stream fileStream, CancellationToken cancellationToken = default);
    Task<ProcessedTakeMedia> ProcessUploadedTakeAsync(
        Guid pieceId,
        Guid sessionId,
        Guid takeId,
        string originalFileName,
        Stream fileStream,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<byte[]>> ExtractVideoPostureFramesAsync(
        string videoRelativePath,
        int maxFrames = 4,
        CancellationToken cancellationToken = default);
    string GetFullPath(string relativePath);
    bool FileExists(string relativePath);
    void DeleteMediaFileIfExists(string? relativePath);
    void DeleteSessionMediaDirectory(Guid pieceId, Guid sessionId);
    void DeletePieceMediaDirectory(Guid pieceId);
}

public record ProcessedTakeMedia(
    string OriginalRelativePath,
    string ExtractedAudioRelativePath,
    OriginalMediaType OriginalMediaType,
    double? DurationSeconds
);

public class MediaProcessingService : IMediaProcessingService
{
    private static readonly HashSet<string> SupportedAudioExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"
    };

    private static readonly HashSet<string> SupportedVideoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp4", ".mov", ".mkv", ".webm"
    };

    private static readonly SemaphoreSlim SubprocessGate = new(2, 2);
    private static readonly TimeSpan FfmpegTimeout = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan FfprobeTimeout = TimeSpan.FromSeconds(15);

    private readonly CadenceStoragePaths _paths;
    private readonly ILogger<MediaProcessingService> _logger;

    public MediaProcessingService(CadenceStoragePaths paths, ILogger<MediaProcessingService> logger)
    {
        _paths = paths;
        _logger = logger;
    }

    public string GetFullPath(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath) || relativePath.Contains('\0'))
        {
            throw new ArgumentException("Invalid media path.");
        }

        var normalized = relativePath.Replace('\\', '/').TrimStart('/');
        if (string.IsNullOrWhiteSpace(normalized) || Path.IsPathRooted(normalized))
        {
            throw new ArgumentException("Invalid media path.");
        }

        var segments = normalized.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 0 || segments.Any(s => s is "." or ".."))
        {
            throw new ArgumentException("Invalid path traversal sequence detected.");
        }

        var canonicalRoot = Path.GetFullPath(_paths.MediaDir)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var rootWithSep = canonicalRoot + Path.DirectorySeparatorChar;

        // If MediaDir itself is inside a symlinked temp folder (e.g. /var/folders on macOS), resolve its real target
        var rootDirInfo = new DirectoryInfo(canonicalRoot);
        if (rootDirInfo.Exists && rootDirInfo.LinkTarget != null)
        {
            var resolvedRoot = rootDirInfo.ResolveLinkTarget(returnFinalTarget: true);
            if (resolvedRoot != null)
            {
                canonicalRoot = Path.GetFullPath(resolvedRoot.FullName)
                    .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                rootWithSep = canonicalRoot + Path.DirectorySeparatorChar;
            }
        }

        var candidatePath = Path.GetFullPath(Path.Combine(canonicalRoot, Path.Combine(segments)));
        if (!candidatePath.StartsWith(rootWithSep, StringComparison.Ordinal))
        {
            throw new ArgumentException("Invalid path traversal sequence detected.");
        }

        // Walk each path segment from canonicalRoot down to candidatePath and reject any symlink / reparse point
        var currentPath = canonicalRoot;
        for (int i = 0; i < segments.Length; i++)
        {
            currentPath = Path.Combine(currentPath, segments[i]);
            bool isLast = i == segments.Length - 1;

            FileSystemInfo fsi = isLast && File.Exists(currentPath)
                ? new FileInfo(currentPath)
                : new DirectoryInfo(currentPath);

            // Check both FileInfo and DirectoryInfo for dangling symlinks or existing symlinks
            var fi = new FileInfo(currentPath);
            var di = new DirectoryInfo(currentPath);
            if (fi.LinkTarget != null || di.LinkTarget != null ||
                ((fi.Exists || di.Exists) && (fsi.Attributes & FileAttributes.ReparsePoint) != 0))
            {
                throw new ArgumentException("Symlinks are not permitted inside media storage.");
            }
        }

        return candidatePath;
    }

    public bool FileExists(string relativePath)
    {
        try
        {
            var fullPath = GetFullPath(relativePath);
            return File.Exists(fullPath);
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    public void DeleteMediaFileIfExists(string? relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return;
        }

        try
        {
            var fullPath = GetFullPath(relativePath);
            if (File.Exists(fullPath))
            {
                File.Delete(fullPath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete media file {RelativePath}", relativePath);
        }
    }

    public void DeleteSessionMediaDirectory(Guid pieceId, Guid sessionId)
    {
        var relativeDir = Path.Combine("pieces", pieceId.ToString(), "sessions", sessionId.ToString());
        DeleteMediaDirectoryInternal(relativeDir);
    }

    public void DeletePieceMediaDirectory(Guid pieceId)
    {
        var relativeDir = Path.Combine("pieces", pieceId.ToString());
        DeleteMediaDirectoryInternal(relativeDir);
    }

    private void DeleteMediaDirectoryInternal(string relativeDir)
    {
        try
        {
            var fullDir = GetFullPath(relativeDir);
            if (Directory.Exists(fullDir))
            {
                Directory.Delete(fullDir, recursive: true);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete media directory {RelativeDir}", relativeDir);
        }
    }

    public async Task<string> SaveScorePdfAsync(Guid pieceId, Stream fileStream, CancellationToken cancellationToken = default)
    {
        var relativeDir = Path.Combine("pieces", pieceId.ToString(), "scores");
        var absoluteDir = GetFullPath(relativeDir);
        Directory.CreateDirectory(absoluteDir);

        var relativePath = Path.Combine(relativeDir, "score.pdf").Replace('\\', '/');
        var absolutePath = GetFullPath(relativePath);
        var tempPath = Path.Combine(absoluteDir, $".score.{Guid.NewGuid():N}.tmp");

        try
        {
            await using (var output = new FileStream(tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
            {
                await fileStream.CopyToAsync(output, cancellationToken);
                await output.FlushAsync(cancellationToken);
            }

            await ValidatePdfSignatureAsync(tempPath, cancellationToken);

            File.Move(tempPath, absolutePath, overwrite: true);
            _logger.LogInformation("Saved piece score PDF at {Path}", absolutePath);
            return relativePath;
        }
        finally
        {
            TryDeleteFile(tempPath);
        }
    }

    private static async Task ValidatePdfSignatureAsync(string filePath, CancellationToken cancellationToken)
    {
        var info = new FileInfo(filePath);
        if (!info.Exists || info.Length < 5)
        {
            throw new InvalidMediaException("Uploaded file is not a valid PDF document.");
        }

        var header = new byte[5];
        await using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 64, useAsync: true);
        var read = await fs.ReadAsync(header.AsMemory(0, 5), cancellationToken);
        if (read < 5 || header[0] != 0x25 || header[1] != 0x50 || header[2] != 0x44 || header[3] != 0x46 || header[4] != 0x2D)
        {
            // %PDF-
            throw new InvalidMediaException("Only valid PDF files (%PDF- header) are supported for scores.");
        }
    }

    public async Task<ProcessedTakeMedia> ProcessUploadedTakeAsync(
        Guid pieceId,
        Guid sessionId,
        Guid takeId,
        string originalFileName,
        Stream fileStream,
        CancellationToken cancellationToken = default)
    {
        var effectiveTakeId = takeId != Guid.Empty ? takeId : Guid.CreateVersion7();
        var relativeDir = Path.Combine("pieces", pieceId.ToString(), "sessions", sessionId.ToString());
        var absoluteDir = GetFullPath(relativeDir);
        Directory.CreateDirectory(absoluteDir);

        var ext = Path.GetExtension(originalFileName).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(ext))
        {
            ext = ".mp4";
        }

        var isVideo = SupportedVideoExtensions.Contains(ext);
        var isAudio = SupportedAudioExtensions.Contains(ext);
        if (!isVideo && !isAudio)
        {
            throw new InvalidMediaException($"Unsupported media format '{ext}'. Upload a supported audio or video file.");
        }

        var mediaType = isVideo ? OriginalMediaType.VideoMp4 : OriginalMediaType.AudioMp3;
        var origRelativePath = Path.Combine(relativeDir, $"take_{effectiveTakeId:N}_orig{ext}").Replace('\\', '/');
        var origAbsolutePath = GetFullPath(origRelativePath);
        string? extractedAudioAbsolutePath = null;

        try
        {
            // Create original file exclusively so an existing file can never be truncated
            await using (var output = new FileStream(origAbsolutePath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
            {
                await fileStream.CopyToAsync(output, cancellationToken);
                await output.FlushAsync(cancellationToken);
            }

            if (new FileInfo(origAbsolutePath).Length == 0)
            {
                throw new InvalidMediaException("Uploaded media file is empty.");
            }

            // Ensure the media file contains a valid audio stream before or during extraction
            await EnsureHasAudioStreamAsync(origAbsolutePath, ext, isVideo, cancellationToken);

            string extractedAudioRelativePath;
            if (isVideo || ext != ".mp3")
            {
                extractedAudioRelativePath = Path.Combine(relativeDir, $"take_{effectiveTakeId:N}_audio.mp3").Replace('\\', '/');
                extractedAudioAbsolutePath = GetFullPath(extractedAudioRelativePath);

                try
                {
                    await ExtractAudioWithFfmpegAsync(origAbsolutePath, extractedAudioAbsolutePath, cancellationToken);
                }
                catch (Exception ex) when (!isVideo && ex is not OperationCanceledException and not InvalidMediaException)
                {
                    // For non-MP3 audio files (e.g., .wav) where FFmpeg might not be installed in a minimal environment,
                    // fall back gracefully to the original audio file so DSP (soundfile) and playback still work.
                    _logger.LogWarning(ex, "FFmpeg transcode of audio {Ext} failed; falling back to original audio file.", ext);
                    TryDeleteFile(extractedAudioAbsolutePath);
                    extractedAudioAbsolutePath = null;
                    extractedAudioRelativePath = origRelativePath;
                }
            }
            else
            {
                extractedAudioRelativePath = origRelativePath;
            }

            var durationSeconds = await ProbeDurationSecondsAsync(origAbsolutePath, cancellationToken);

            return new ProcessedTakeMedia(
                origRelativePath,
                extractedAudioRelativePath,
                mediaType,
                durationSeconds
            );
        }
        catch
        {
            TryDeleteFile(origAbsolutePath);
            if (extractedAudioAbsolutePath != null)
            {
                TryDeleteFile(extractedAudioAbsolutePath);
            }
            throw;
        }
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

        string videoFullPath;
        try
        {
            videoFullPath = GetFullPath(videoRelativePath);
        }
        catch (ArgumentException)
        {
            return [];
        }

        if (!File.Exists(videoFullPath))
        {
            return [];
        }

        var duration = await ProbeDurationSecondsAsync(videoFullPath, cancellationToken) ?? 12.0;
        var tempDir = Path.Combine(Path.GetTempPath(), $"cadence_frames_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        await SubprocessGate.WaitAsync(cancellationToken);
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
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };
                startInfo.ArgumentList.Add("-y");
                startInfo.ArgumentList.Add("-ss");
                startInfo.ArgumentList.Add(tsFormatted);
                startInfo.ArgumentList.Add("-i");
                startInfo.ArgumentList.Add(videoFullPath);
                startInfo.ArgumentList.Add("-frames:v");
                startInfo.ArgumentList.Add("1");
                startInfo.ArgumentList.Add("-vf");
                startInfo.ArgumentList.Add("scale='min(1280,iw)':-2");
                startInfo.ArgumentList.Add("-q:v");
                startInfo.ArgumentList.Add("4");
                startInfo.ArgumentList.Add(framePath);

                var (exitCode, _, _) = await RunProcessWithTimeoutAsync(startInfo, FfmpegTimeout, cancellationToken);

                if (exitCode == 0 && File.Exists(framePath))
                {
                    frames.Add(await File.ReadAllBytesAsync(framePath, cancellationToken));
                }
            }

            return frames;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not extract video posture frames for {VideoPath}", videoFullPath);
            return [];
        }
        finally
        {
            SubprocessGate.Release();
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

    private async Task EnsureHasAudioStreamAsync(string inputPath, string ext, bool isVideo, CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "ffprobe",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        startInfo.ArgumentList.Add("-v");
        startInfo.ArgumentList.Add("error");
        startInfo.ArgumentList.Add("-select_streams");
        startInfo.ArgumentList.Add("a");
        startInfo.ArgumentList.Add("-show_entries");
        startInfo.ArgumentList.Add("stream=codec_type");
        startInfo.ArgumentList.Add("-of");
        startInfo.ArgumentList.Add("csv=p=0");
        startInfo.ArgumentList.Add(inputPath);

        try
        {
            var (exitCode, stdout, stderr) = await RunProcessWithTimeoutAsync(startInfo, FfprobeTimeout, cancellationToken);
            if (exitCode != 0)
            {
                throw new InvalidMediaException($"Media file could not be read or is corrupted: {stderr.Trim()}");
            }

            if (string.IsNullOrWhiteSpace(stdout))
            {
                throw new InvalidMediaException("Uploaded media contains no audio stream.");
            }
        }
        catch (Exception ex) when (ex is not InvalidMediaException and not OperationCanceledException && !isVideo)
        {
            // Minimal environments without ffprobe installed still allow basic WAV/MP3 uploads
            _logger.LogWarning(ex, "ffprobe unavailable when validating audio {Ext}; falling back to header check.", ext);
        }
    }

    private async Task ExtractAudioWithFfmpegAsync(string inputPath, string outputMp3Path, CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "ffmpeg",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        startInfo.ArgumentList.Add("-y");
        startInfo.ArgumentList.Add("-i");
        startInfo.ArgumentList.Add(inputPath);
        startInfo.ArgumentList.Add("-vn");
        startInfo.ArgumentList.Add("-ac");
        startInfo.ArgumentList.Add("1");
        startInfo.ArgumentList.Add("-ar");
        startInfo.ArgumentList.Add("24000");
        startInfo.ArgumentList.Add("-b:a");
        startInfo.ArgumentList.Add("96k");
        startInfo.ArgumentList.Add(outputMp3Path);

        await SubprocessGate.WaitAsync(cancellationToken);
        try
        {
            var (exitCode, _, stderr) = await RunProcessWithTimeoutAsync(startInfo, FfmpegTimeout, cancellationToken);

            if (exitCode != 0)
            {
                _logger.LogError("FFmpeg audio extraction failed (exit code {ExitCode}): {Error}", exitCode, stderr);
                if (stderr.Contains("Output file does not contain any stream", StringComparison.OrdinalIgnoreCase) ||
                    stderr.Contains("matches no streams", StringComparison.OrdinalIgnoreCase) ||
                    stderr.Contains("Invalid data found when processing input", StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidMediaException("Uploaded media does not contain a decodable audio stream.");
                }
                throw new InvalidOperationException($"FFmpeg audio extraction failed: {stderr}");
            }

            _logger.LogInformation("Successfully extracted mono audio to {OutputMp3Path}", outputMp3Path);
        }
        finally
        {
            SubprocessGate.Release();
        }
    }

    private async Task<double?> ProbeDurationSecondsAsync(string inputPath, CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "ffprobe",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        startInfo.ArgumentList.Add("-v");
        startInfo.ArgumentList.Add("error");
        startInfo.ArgumentList.Add("-show_entries");
        startInfo.ArgumentList.Add("format=duration");
        startInfo.ArgumentList.Add("-of");
        startInfo.ArgumentList.Add("default=noprint_wrappers=1:nokey=1");
        startInfo.ArgumentList.Add(inputPath);

        try
        {
            var (exitCode, stdout, _) = await RunProcessWithTimeoutAsync(startInfo, FfprobeTimeout, cancellationToken);
            if (exitCode == 0 && double.TryParse(stdout.Trim(), NumberStyles.Any, CultureInfo.InvariantCulture, out var duration))
            {
                return duration;
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not probe media duration with ffprobe for {Path}", inputPath);
        }

        return null;
    }

    internal static async Task<(int ExitCode, string Stdout, string Stderr)> RunProcessWithTimeoutAsync(
        ProcessStartInfo startInfo,
        TimeSpan timeout,
        CancellationToken cancellationToken)
    {
        using var process = new Process { StartInfo = startInfo };
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        cts.CancelAfter(timeout);

        process.Start();

        var stdoutTask = process.StandardOutput.ReadToEndAsync(CancellationToken.None);
        var stderrTask = process.StandardError.ReadToEndAsync(CancellationToken.None);

        try
        {
            await process.WaitForExitAsync(cts.Token);
            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            return (process.ExitCode, stdout, stderr);
        }
        catch (OperationCanceledException)
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill(entireProcessTree: true);
                }
            }
            catch
            {
                // Process already exited
            }

            using var exitTimeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            try
            {
                await process.WaitForExitAsync(exitTimeoutCts.Token);
            }
            catch
            {
                // Best effort wait after SIGKILL
            }

            await ((Task)Task.WhenAll(stdoutTask, stderrTask)).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
            throw;
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
