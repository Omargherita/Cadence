using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Domain.PianoMentor;
using Cadence.Api.Features.MusicalLibrary;
using Cadence.Api.Features.Organizer;
using Cadence.Api.Features.PianoMentor;
using Cadence.Api.Features.System;
using Cadence.Api.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using System.Text.Json.Serialization;

namespace Cadence.Api.Tests;

public class MediaPreservationTests
{
    internal sealed class DisposableTestHost : IAsyncDisposable
    {
        public string TempRoot { get; }
        public CadenceStoragePaths StoragePaths { get; }
        public WebApplication App { get; }
        public HttpClient Client { get; }

        private DisposableTestHost(string tempRoot, CadenceStoragePaths storagePaths, WebApplication app, HttpClient client)
        {
            TempRoot = tempRoot;
            StoragePaths = storagePaths;
            App = app;
            Client = client;
        }

        public static async Task<DisposableTestHost> CreateAsync(
            IAudioDspAnalyzer? customDspAnalyzer = null,
            IPianoMentorService? customMentorService = null)
        {
            var tempRoot = Path.Combine(Path.GetTempPath(), $"cadence_batch1_test_{Guid.NewGuid():N}");
            var storagePaths = new CadenceStoragePaths(tempRoot);
            storagePaths.EnsureDirectoriesCreated();

            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                Args = ["--urls", "http://127.0.0.1:0"]
            });

            builder.Logging.ClearProviders();

            const long maxUploadBytes = 500L * 1024 * 1024;
            builder.WebHost.ConfigureKestrel(options =>
            {
                options.Limits.MaxRequestBodySize = maxUploadBytes;
            });
            builder.Services.Configure<FormOptions>(options =>
            {
                options.MultipartBodyLengthLimit = maxUploadBytes;
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
            if (customDspAnalyzer != null)
            {
                builder.Services.AddSingleton(customDspAnalyzer);
            }
            else
            {
                builder.Services.AddSingleton<IAudioDspAnalyzer>(new FastFakeDspAnalyzer());
            }

            if (customMentorService != null)
            {
                builder.Services.AddSingleton(customMentorService);
            }
            else
            {
                builder.Services.AddSingleton<IPianoMentorService>(new SyncReplayTests.CountingMentor());
            }

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
            app.MapDomainEditingEndpoints();
            app.MapPianoMentorEndpoints();
            app.MapMediaStreamEndpoints();

            await app.StartAsync();
            var address = app.Urls.Single();
            var client = new HttpClient { BaseAddress = new Uri(address) };

            return new DisposableTestHost(tempRoot, storagePaths, app, client);
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
                // Ignore cleanup races
            }
        }
    }

    private sealed class FastFakeDspAnalyzer : IAudioDspAnalyzer
    {
        public Task<ObjectiveDspMetrics> AnalyzeAudioAsync(string audioFilePath, CancellationToken ct = default)
        {
            return Task.FromResult(new ObjectiveDspMetrics
            {
                AnalyzerStatus = "Available",
                DurationSeconds = 2.0,
                EstimatedMeanBpm = 120.0,
                TempoStabilityStdDevBpm = 1.2,
                DynamicRangeRmsDb = 14.0,
                DynamicEnvelopeNotes = "Synthetic test metrics",
                RawJson = "{\"analyzerStatus\":\"Available\",\"durationSeconds\":2.0}"
            });
        }
    }

    internal static byte[] CreateSyntheticWavBytes(int sampleRate, double durationSeconds, double frequencyHz)
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
            double sample = Math.Sin(2 * Math.PI * frequencyHz * t) * 0.5;
            bw.Write((short)(sample * short.MaxValue));
        }

        bw.Flush();
        return ms.ToArray();
    }

    internal static async Task<(Guid PieceId, Guid SessionId)> CreatePieceAndSessionAsync(HttpClient client)
    {
        var pieceId = Guid.CreateVersion7();
        var pieceRes = await client.PostAsJsonAsync("/api/pieces", new
        {
            id = pieceId,
            title = "Nocturne Op. 27 No. 2",
            composer = "Chopin",
            bucket = "MainChallenge"
        });
        pieceRes.EnsureSuccessStatusCode();

        var sessionId = Guid.CreateVersion7();
        var sessionRes = await client.PostAsJsonAsync($"/api/pieces/{pieceId}/sessions", new
        {
            id = sessionId,
            durationMinutes = 30,
            targetSection = "Bars 1-16"
        });
        sessionRes.EnsureSuccessStatusCode();

        return (pieceId, sessionId);
    }

    private static async Task<PracticeTake> UploadTakeAsync(HttpClient client, Guid pieceId, Guid sessionId, string fileName, byte[] payload, Guid? takeId = null)
    {
        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(payload);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");
        form.Add(fileContent, "file", fileName);
        form.Add(new StringContent("PassageClip"), "scope");
        form.Add(new StringContent("Bars 1-8"), "targetSection");
        if (takeId.HasValue)
        {
            form.Add(new StringContent(takeId.Value.ToString()), "id");
        }

        var res = await client.PostAsync($"/api/pieces/{pieceId}/sessions/{sessionId}/takes", form);
        res.EnsureSuccessStatusCode();
        var take = await res.Content.ReadFromJsonAsync<PracticeTake>(new System.Text.Json.JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            Converters = { new JsonStringEnumConverter() }
        });
        return take!;
    }

    [Fact]
    public async Task UploadTakes1And2_DeleteTake1_UploadAgain_PreservesOriginalsAndAllocatesDistinctNumbers()
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var (pieceId, sessionId) = await CreatePieceAndSessionAsync(host.Client);

        var bytes1 = CreateSyntheticWavBytes(24000, 0.5, 440.0);
        var bytes2 = CreateSyntheticWavBytes(24000, 0.5, 554.37);
        var bytes3 = CreateSyntheticWavBytes(24000, 0.5, 659.25);

        var take1 = await UploadTakeAsync(host.Client, pieceId, sessionId, "take1.wav", bytes1);
        var take2 = await UploadTakeAsync(host.Client, pieceId, sessionId, "take2.wav", bytes2);

        var take1OrigFullPath = Path.Combine(host.StoragePaths.MediaDir, take1.OriginalMediaRelativePath);
        var take2OrigFullPath = Path.Combine(host.StoragePaths.MediaDir, take2.OriginalMediaRelativePath);

        Assert.Equal(bytes2, await File.ReadAllBytesAsync(take2OrigFullPath));

        // Delete take 1
        var delRes = await host.Client.DeleteAsync($"/api/pieces/{pieceId}/sessions/{sessionId}/takes/{take1.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delRes.StatusCode);

        // Upload a third take
        var take3 = await UploadTakeAsync(host.Client, pieceId, sessionId, "take3.wav", bytes3);
        var take3OrigFullPath = Path.Combine(host.StoragePaths.MediaDir, take3.OriginalMediaRelativePath);

        // Three distinct relative paths
        Assert.NotEqual(take1.OriginalMediaRelativePath, take2.OriginalMediaRelativePath);
        Assert.NotEqual(take2.OriginalMediaRelativePath, take3.OriginalMediaRelativePath);
        Assert.NotEqual(take1.OriginalMediaRelativePath, take3.OriginalMediaRelativePath);

        // Take 2's original file must still contain bytes2 (not overwritten by take 3!)
        Assert.Equal(bytes2, await File.ReadAllBytesAsync(take2OrigFullPath));
        Assert.Equal(bytes3, await File.ReadAllBytesAsync(take3OrigFullPath));

        // No duplicate take numbers
        Assert.NotEqual(take2.TakeNumber, take3.TakeNumber);
        Assert.Equal(2, take2.TakeNumber);
        Assert.Equal(3, take3.TakeNumber);

        // Deleted take 1's media should also have been cleaned up (R04)
        Assert.False(File.Exists(take1OrigFullPath));
    }

    [Fact]
    public async Task ConcurrentUploads_NeverShareFileOrTakeNumber()
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var (pieceId, sessionId) = await CreatePieceAndSessionAsync(host.Client);

        const int concurrentCount = 5;
        var payloads = Enumerable.Range(0, concurrentCount)
            .Select(i => CreateSyntheticWavBytes(24000, 0.3, 300.0 + i * 50))
            .ToArray();

        var uploadTasks = Enumerable.Range(0, concurrentCount)
            .Select(i => UploadTakeAsync(host.Client, pieceId, sessionId, $"concurrent_{i}.wav", payloads[i]))
            .ToArray();

        var takes = await Task.WhenAll(uploadTasks);

        var distinctNumbers = takes.Select(t => t.TakeNumber).Distinct().OrderBy(n => n).ToList();
        var distinctOrigPaths = takes.Select(t => t.OriginalMediaRelativePath).Distinct().ToList();

        Assert.Equal(concurrentCount, distinctNumbers.Count);
        Assert.Equal(Enumerable.Range(1, concurrentCount).ToList(), distinctNumbers);
        Assert.Equal(concurrentCount, distinctOrigPaths.Count);

        for (int i = 0; i < concurrentCount; i++)
        {
            var fullPath = Path.Combine(host.StoragePaths.MediaDir, takes[i].OriginalMediaRelativePath);
            Assert.Equal(payloads[i], await File.ReadAllBytesAsync(fullPath));
        }
    }

    [Fact]
    public async Task SaveScorePdf_WhenReplacementStreamThrowsMidCopy_LeavesOldScoreIntact()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), $"cadence_b02_test_{Guid.NewGuid():N}");
        var paths = new CadenceStoragePaths(tempRoot);
        paths.EnsureDirectoriesCreated();

        try
        {
            var mediaService = new MediaProcessingService(paths, NullLogger<MediaProcessingService>.Instance);
            var pieceId = Guid.CreateVersion7();

            var validPdfBytes = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
            await using var initialStream = new MemoryStream(validPdfBytes);
            var relPath = await mediaService.SaveScorePdfAsync(pieceId, initialStream);
            var fullPath = mediaService.GetFullPath(relPath);

            Assert.Equal(validPdfBytes, await File.ReadAllBytesAsync(fullPath));

            // Attempt replacement with a stream that throws mid-copy
            await using var throwingStream = new ThrowingMidCopyStream(Encoding.ASCII.GetBytes("%PDF-1.7\nPARTIAL_CONTENT"));
            await Assert.ThrowsAsync<IOException>(async () =>
            {
                await mediaService.SaveScorePdfAsync(pieceId, throwingStream);
            });

            // Previous score must remain completely intact and non-zero
            Assert.True(File.Exists(fullPath));
            var survivingBytes = await File.ReadAllBytesAsync(fullPath);
            Assert.Equal(validPdfBytes, survivingBytes);
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
    public async Task SymlinkPointingOutsideMediaRoot_IsRejectedOnMediaAndScoreEndpoints()
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var (pieceId, _) = await CreatePieceAndSessionAsync(host.Client);

        var outsideFile = Path.Combine(host.TempRoot, "outside_secret.pdf");
        await File.WriteAllTextAsync(outsideFile, "%PDF-1.7 SECRET_OUTSIDE_MEDIA_ROOT");

        var scoreDir = Path.Combine(host.StoragePaths.MediaDir, "pieces", pieceId.ToString(), "scores");
        Directory.CreateDirectory(scoreDir);
        var symlinkPath = Path.Combine(scoreDir, "score.pdf");
        File.CreateSymbolicLink(symlinkPath, outsideFile);

        // Set piece.ScoreFilePath in DB to point to the symlink
        using (var scope = host.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CadenceDbContext>();
            var piece = await db.Pieces.FindAsync(pieceId);
            piece!.ScoreFilePath = $"pieces/{pieceId}/scores/score.pdf";
            piece.ScoreCapabilityTier = ScoreCapabilityTier.VisualPdfOnly;
            await db.SaveChangesAsync();
        }

        var mediaRes = await host.Client.GetAsync($"/api/media/pieces/{pieceId}/scores/score.pdf");
        Assert.NotEqual(HttpStatusCode.OK, mediaRes.StatusCode);

        var scoreRes = await host.Client.GetAsync($"/api/pieces/{pieceId}/score");
        Assert.NotEqual(HttpStatusCode.OK, scoreRes.StatusCode);
    }

    [Fact]
    public async Task CancelledDspSubprocess_TerminatesChildProcessTreeAndCleansUp()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), $"cadence_r03_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        try
        {
            var audioFile = Path.Combine(tempDir, "input.wav");
            await File.WriteAllBytesAsync(audioFile, CreateSyntheticWavBytes(24000, 0.2, 440.0));

            var pidFile = Path.Combine(tempDir, "child.pid");
            var fakeScript = Path.Combine(tempDir, "analyze.py");
            await File.WriteAllTextAsync(fakeScript,
                $"import os, time\nwith open({System.Text.Json.JsonSerializer.Serialize(pidFile)}, 'w') as f:\n    f.write(str(os.getpid()))\n    f.flush()\ntime.sleep(60)\n");

            var analyzer = new PythonAudioDspAnalyzer(
                NullLogger<PythonAudioDspAnalyzer>.Instance,
                pythonPathOverride: "python3",
                scriptPathOverride: fakeScript);

            using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(300));
            var metrics = await analyzer.AnalyzeAudioAsync(audioFile, cts.Token);

            Assert.Equal("Unavailable", metrics.AnalyzerStatus);
            Assert.True(File.Exists(pidFile), "Fake child script should have started and written its PID.");

            var pid = int.Parse((await File.ReadAllTextAsync(pidFile)).Trim());
            bool childStillAlive = false;
            try
            {
                using var proc = Process.GetProcessById(pid);
                childStillAlive = !proc.HasExited;
                if (childStillAlive)
                {
                    proc.Kill(entireProcessTree: true);
                }
            }
            catch (ArgumentException)
            {
                childStillAlive = false;
            }

            Assert.False(childStillAlive, $"Cancelled DSP child process (PID {pid}) was left running!");
        }
        finally
        {
            if (Directory.Exists(tempDir))
            {
                Directory.Delete(tempDir, recursive: true);
            }
        }
    }

    [Fact]
    public async Task UploadValidation_RejectsSpoofedPdf_AndRejectsVideoWithNoAudioLeavingNoOrphanFile()
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var (pieceId, sessionId) = await CreatePieceAndSessionAsync(host.Client);

        // 1. Text file named .pdf must be rejected
        using (var scoreForm = new MultipartFormDataContent())
        {
            var fakePdfContent = new ByteArrayContent(Encoding.UTF8.GetBytes("This is plain text pretending to be a PDF"));
            fakePdfContent.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
            scoreForm.Add(fakePdfContent, "file", "fake_score.pdf");

            var scoreRes = await host.Client.PostAsync($"/api/pieces/{pieceId}/score", scoreForm);
            Assert.Equal(HttpStatusCode.BadRequest, scoreRes.StatusCode);
        }

        // 2. Video with no audio stream returns 4xx and leaves no orphan file
        var videoOnlyPath = Path.Combine(host.TempRoot, "video_no_audio.mp4");
        using (var ff = Process.Start(new ProcessStartInfo
        {
            FileName = "ffmpeg",
            ArgumentList = { "-y", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.5", "-an", "-c:v", "mpeg4", videoOnlyPath },
            RedirectStandardOutput = true,
            RedirectStandardError = true
        })!)
        {
            await ff.WaitForExitAsync();
            Assert.Equal(0, ff.ExitCode);
        }

        using (var takeForm = new MultipartFormDataContent())
        {
            var videoBytes = await File.ReadAllBytesAsync(videoOnlyPath);
            var videoContent = new ByteArrayContent(videoBytes);
            videoContent.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
            takeForm.Add(videoContent, "file", "silent_video.mp4");
            takeForm.Add(new StringContent("PassageClip"), "scope");

            var takeRes = await host.Client.PostAsync($"/api/pieces/{pieceId}/sessions/{sessionId}/takes", takeForm);
            Assert.True((int)takeRes.StatusCode >= 400 && (int)takeRes.StatusCode < 500,
                $"Expected 4xx for video without audio, but got {(int)takeRes.StatusCode} ({takeRes.StatusCode})");
        }

        // Verify no orphan files remain in the media directory
        var survivingMediaFiles = Directory.Exists(host.StoragePaths.MediaDir)
            ? Directory.GetFiles(host.StoragePaths.MediaDir, "*", SearchOption.AllDirectories)
            : [];
        Assert.Empty(survivingMediaFiles);
    }

    [Fact]
    public async Task DeletingSessionOrPiece_DeletesCorrespondingMediaFilesFromDisk()
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var (pieceId, sessionId) = await CreatePieceAndSessionAsync(host.Client);

        // Upload a score PDF
        using (var scoreForm = new MultipartFormDataContent())
        {
            var pdfBytes = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
            var pdfContent = new ByteArrayContent(pdfBytes);
            pdfContent.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
            scoreForm.Add(pdfContent, "file", "score.pdf");
            var scoreRes = await host.Client.PostAsync($"/api/pieces/{pieceId}/score", scoreForm);
            scoreRes.EnsureSuccessStatusCode();
        }

        // Upload a take into the session
        var take = await UploadTakeAsync(host.Client, pieceId, sessionId, "take.wav", CreateSyntheticWavBytes(24000, 0.3, 440.0));
        var takeOrigFullPath = Path.Combine(host.StoragePaths.MediaDir, take.OriginalMediaRelativePath);
        var scoreFullPath = Path.Combine(host.StoragePaths.MediaDir, "pieces", pieceId.ToString(), "scores", "score.pdf");

        Assert.True(File.Exists(takeOrigFullPath));
        Assert.True(File.Exists(scoreFullPath));

        // Delete session -> session media files removed, score remains
        var delSessionRes = await host.Client.DeleteAsync($"/api/pieces/{pieceId}/sessions/{sessionId}");
        Assert.Equal(HttpStatusCode.NoContent, delSessionRes.StatusCode);
        Assert.False(File.Exists(takeOrigFullPath));
        Assert.True(File.Exists(scoreFullPath));

        // Delete piece -> score and piece media directory removed
        var delPieceRes = await host.Client.DeleteAsync($"/api/pieces/{pieceId}");
        Assert.Equal(HttpStatusCode.NoContent, delPieceRes.StatusCode);
        Assert.False(File.Exists(scoreFullPath));
        Assert.False(Directory.Exists(Path.Combine(host.StoragePaths.MediaDir, "pieces", pieceId.ToString())));
    }

    private sealed class ThrowingMidCopyStream(byte[] prefixBytes) : Stream
    {
        private int _offset;

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => _offset; set => throw new NotSupportedException(); }

        public override void Flush() { }

        public override int Read(byte[] buffer, int offset, int count)
        {
            if (_offset < prefixBytes.Length)
            {
                int toCopy = Math.Min(count, prefixBytes.Length - _offset);
                Array.Copy(prefixBytes, _offset, buffer, offset, toCopy);
                _offset += toCopy;
                return toCopy;
            }
            throw new IOException("Simulated mid-copy stream failure.");
        }

        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (_offset < prefixBytes.Length)
            {
                int toCopy = Math.Min(buffer.Length, prefixBytes.Length - _offset);
                prefixBytes.AsMemory(_offset, toCopy).CopyTo(buffer);
                _offset += toCopy;
                return ValueTask.FromResult(toCopy);
            }
            return ValueTask.FromException<int>(new IOException("Simulated mid-copy stream failure."));
        }

        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }
}
