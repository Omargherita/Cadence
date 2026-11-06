using System.Text.Json;
using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Domain.PianoMentor;
using Cadence.Api.Features.PianoMentor;
using Cadence.Api.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Cadence.Api.Tests;

public class AudioDspAnalyzerTests
{
    private readonly PythonAudioDspAnalyzer _analyzer = new(NullLogger<PythonAudioDspAnalyzer>.Instance);

    [Fact]
    public async Task AnalyzeAudioAsync_WithMissingFile_ReturnsUnavailableGracefully()
    {
        // Act
        var result = await _analyzer.AnalyzeAudioAsync("/tmp/definitely_nonexistent_audio_12345.mp3");

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Unavailable", result.AnalyzerStatus);
        Assert.Equal(0.0, result.DurationSeconds);
        Assert.Equal(0.0, result.EstimatedMeanBpm);
        Assert.NotNull(result.RawJson);
        Assert.Contains("Unavailable", result.RawJson);
    }

    [Fact]
    public async Task AnalyzeAudioAsync_WithValidAudio_ReturnsDeterministicDspMetrics()
    {
        // Arrange - Ensure synthetic audio file exists
        var audioPath = Path.Combine(Path.GetTempPath(), "cadence_test_synth.wav");
        CreateSyntheticWavFile(audioPath, 24000, 4.0);

        try
        {
            // Act
            var result = await _analyzer.AnalyzeAudioAsync(audioPath);

            // Assert
            Assert.NotNull(result);
            Assert.Equal("Available", result.AnalyzerStatus);
            Assert.True(result.DurationSeconds > 0, "Duration must be greater than 0");
            Assert.True(result.EstimatedMeanBpm >= 0, "EstimatedMeanBpm must be non-negative");
            Assert.NotNull(result.DynamicEnvelopeNotes);
            Assert.NotNull(result.RawJson);

            // Verify JSON deserializability
            using var doc = JsonDocument.Parse(result.RawJson);
            Assert.Equal("Available", doc.RootElement.GetProperty("analyzerStatus").GetString());
        }
        finally
        {
            if (File.Exists(audioPath))
            {
                File.Delete(audioPath);
            }
        }
    }

    private static void CreateSyntheticWavFile(string path, int sampleRate, double durationSeconds)
    {
        int numSamples = (int)(sampleRate * durationSeconds);
        using var fs = new FileStream(path, FileMode.Create);
        using var bw = new BinaryWriter(fs);

        // RIFF header
        bw.Write(System.Text.Encoding.ASCII.GetBytes("RIFF"));
        bw.Write(36 + numSamples * 2);
        bw.Write(System.Text.Encoding.ASCII.GetBytes("WAVE"));

        // fmt chunk
        bw.Write(System.Text.Encoding.ASCII.GetBytes("fmt "));
        bw.Write(16); // subchunk size
        bw.Write((short)1); // PCM
        bw.Write((short)1); // 1 channel
        bw.Write(sampleRate);
        bw.Write(sampleRate * 2); // byte rate
        bw.Write((short)2); // block align
        bw.Write((short)16); // bits per sample

        // data chunk
        bw.Write(System.Text.Encoding.ASCII.GetBytes("data"));
        bw.Write(numSamples * 2);

        for (int i = 0; i < numSamples; i++)
        {
            double t = (double)i / sampleRate;
            double gain = i < numSamples / 2 ? 0.2 : 0.8;
            double sample = Math.Sin(2 * Math.PI * 440 * t) * gain;
            bw.Write((short)(sample * short.MaxValue));
        }
    }

    [Fact]
    public async Task PianoMentorService_WithDspMetrics_ReflectsMeasuredBpmAndDynamicRangeInCritique()
    {
        // Arrange
        var config = new ConfigurationBuilder().Build();
        var mediaService = new MediaProcessingService(new CadenceStoragePaths(), NullLogger<MediaProcessingService>.Instance);
        var mentorService = new PianoMentorService(
            config,
            mediaService,
            new HttpClient(),
            NullLogger<PianoMentorService>.Instance);

        var piece = new Piece
        {
            Id = Guid.CreateVersion7(),
            Title = "Ballade No. 1 in G minor",
            Composer = "Chopin"
        };

        var session = new PracticeSession
        {
            Id = Guid.CreateVersion7(),
            PieceId = piece.Id,
            StartedAtUtc = DateTimeOffset.UtcNow,
            DurationMinutes = 45,
            TargetSection = "Measures 208-264"
        };

        var take = new PracticeTake
        {
            Id = Guid.CreateVersion7(),
            PracticeSessionId = session.Id,
            TakeNumber = 1,
            TargetSection = "Measures 208-264",
            DurationSeconds = 12.0
        };

        var dspMetrics = new ObjectiveDspMetrics
        {
            AnalyzerStatus = "Available",
            DurationSeconds = 12.0,
            EstimatedMeanBpm = 148.0,
            TempoStabilityStdDevBpm = 3.5,
            DynamicRangeRmsDb = 22.1,
            DetectedTempoAnomalies =
            [
                new DetectedTempoAnomaly
                {
                    TimestampRange = "00:00-00:05",
                    LocalBpm = 100.4,
                    DeviationPercent = -32.1,
                    Type = "Dragging"
                }
            ],
            DynamicEnvelopeNotes = "Dynamic contrast: 22.1 dB. Expansive expressive dynamic headroom (>18 dB contrast)."
        };

        // Act
        var assessment = await mentorService.AssessTakeAsync(piece, session, take, dspMetrics);

        // Assert
        Assert.NotNull(assessment);
        Assert.Contains("148 BPM", assessment.MentorCritique);
        Assert.Contains("dragging", assessment.MentorCritique, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("22.1 dB", assessment.MentorCritique);
        Assert.Contains("148.0 BPM", assessment.EvidenceBreakdown.ObjectiveFindingsSummary);
        Assert.Contains("22.1 dB", assessment.EvidenceBreakdown.ObjectiveFindingsSummary);
        Assert.Contains("Dragging tendency at 00:00-00:05", assessment.EvidenceBreakdown.ObjectiveFindingsSummary);
    }

    [Fact]
    public async Task PianoMentorService_CallGeminiAsync_SendsResponseSchemaAndMultimodalMediaParts()
    {
        // Arrange
        var tempRoot = Path.Combine(Path.GetTempPath(), $"cadence_test_media_{Guid.NewGuid():N}");
        var paths = new CadenceStoragePaths(tempRoot);
        paths.EnsureDirectoriesCreated();

        try
        {
            var pieceId = Guid.CreateVersion7();
            var sessionId = Guid.CreateVersion7();

            var fakeMediaService = new FakePostureMediaService(paths);

            // Create a dummy score PDF and dummy WAV audio file in the media directory
            var scoreRelPath = $"pieces/{pieceId}/scores/score.pdf";
            var scoreFullPath = fakeMediaService.GetFullPath(scoreRelPath);
            Directory.CreateDirectory(Path.GetDirectoryName(scoreFullPath)!);
            await File.WriteAllBytesAsync(scoreFullPath, [0x25, 0x50, 0x44, 0x46]); // %PDF

            var audioRelPath = $"pieces/{pieceId}/sessions/{sessionId}/take_1_orig.wav";
            var audioFullPath = fakeMediaService.GetFullPath(audioRelPath);
            Directory.CreateDirectory(Path.GetDirectoryName(audioFullPath)!);
            CreateSyntheticWavFile(audioFullPath, 24000, 1.0);

            var videoRelPath = $"pieces/{pieceId}/sessions/{sessionId}/take_1_orig.mp4";
            var videoFullPath = fakeMediaService.GetFullPath(videoRelPath);
            await File.WriteAllBytesAsync(videoFullPath, [0x00, 0x00, 0x00, 0x18]);

            string? capturedRequestBody = null;
            var handler = new CapturingHttpMessageHandler(reqBody =>
            {
                capturedRequestBody = reqBody;
                var fakeAssessment = new MentorAssessment
                {
                    SchemaVersion = "1.1.0",
                    MentorCritique = "Live multimodal critique with posture and score context.",
                    AnalysisLimitationsNote = "Full multimodal analysis.",
                    IntraSessionComparison = new IntraSessionComparison
                    {
                        ComparisonVerdict = ComparisonVerdict.FirstTakeInSession,
                        WhatChanged = "Baseline"
                    },
                    EvidenceBreakdown = new EvidenceBreakdown
                    {
                        ObjectiveFindingsSummary = "Steady tempo",
                        ArtisticAndInterpretiveJudgment = "Singing tone"
                    }
                };
                var fakeGeminiResponse = new
                {
                    candidates = new[]
                    {
                        new
                        {
                            content = new
                            {
                                parts = new[]
                                {
                                    new { text = JsonSerializer.Serialize(fakeAssessment) }
                                }
                            }
                        }
                    }
                };
                return JsonSerializer.Serialize(fakeGeminiResponse);
            });

            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["GEMINI_API_KEY"] = "test-api-key"
                })
                .Build();

            var mentorService = new PianoMentorService(
                config,
                fakeMediaService,
                new HttpClient(handler),
                NullLogger<PianoMentorService>.Instance);

            var piece = new Piece
            {
                Id = pieceId,
                Title = "Ballade No. 1",
                Composer = "Chopin",
                ScoreCapabilityTier = ScoreCapabilityTier.VisualPdfOnly,
                ScoreFilePath = scoreRelPath
            };

            var session = new PracticeSession
            {
                Id = sessionId,
                PieceId = pieceId,
                StartedAtUtc = DateTimeOffset.UtcNow,
                DurationMinutes = 30
            };

            var take = new PracticeTake
            {
                Id = Guid.CreateVersion7(),
                PracticeSessionId = sessionId,
                TakeNumber = 1,
                TargetSection = "Measures 1-8",
                AttachedPdfPages = "1-2",
                IncludeVideoPostureAnalysis = true,
                OriginalMediaType = OriginalMediaType.VideoMp4,
                OriginalMediaRelativePath = videoRelPath,
                ExtractedAudioRelativePath = audioRelPath
            };

            // Act
            var assessment = await mentorService.AssessTakeAsync(piece, session, take);

            // Assert
            Assert.NotNull(assessment);
            Assert.Equal("Live multimodal critique with posture and score context.", assessment.MentorCritique);
            Assert.NotNull(capturedRequestBody);

            using var doc = JsonDocument.Parse(capturedRequestBody!);
            var genConfig = doc.RootElement.GetProperty("generationConfig");
            Assert.Equal("application/json", genConfig.GetProperty("response_mime_type").GetString());
            Assert.True(genConfig.TryGetProperty("response_schema", out var schemaElem));
            Assert.Equal("OBJECT", schemaElem.GetProperty("type").GetString());

            var parts = doc.RootElement
                .GetProperty("contents")[0]
                .GetProperty("parts")
                .EnumerateArray()
                .ToList();

            // Expect: 1 text prompt + 1 audio/wav + 1 application/pdf + 2 image/jpeg posture frames = 5 parts
            Assert.Equal(5, parts.Count);

            var mimeTypes = parts
                .Where(p => p.TryGetProperty("inline_data", out _))
                .Select(p => p.GetProperty("inline_data").GetProperty("mime_type").GetString())
                .ToList();

            Assert.Contains("audio/wav", mimeTypes);
            Assert.Contains("application/pdf", mimeTypes);
            Assert.Equal(2, mimeTypes.Count(m => m == "image/jpeg"));
        }
        finally
        {
            if (Directory.Exists(tempRoot))
            {
                Directory.Delete(tempRoot, recursive: true);
            }
        }
    }

    private sealed class FakePostureMediaService(CadenceStoragePaths paths)
        : MediaProcessingService(paths, NullLogger<MediaProcessingService>.Instance)
    {
        public override Task<IReadOnlyList<byte[]>> ExtractVideoPostureFramesAsync(
            string videoRelativePath,
            int maxFrames = 4,
            CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<byte[]>>([[0xFF, 0xD8, 0xFF], [0xFF, 0xD8, 0xFF]]);
        }
    }

    private sealed class CapturingHttpMessageHandler(Func<string, string> responder) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content != null
                ? await request.Content.ReadAsStringAsync(cancellationToken)
                : string.Empty;
            var responseJson = responder(body);
            return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent(responseJson, System.Text.Encoding.UTF8, "application/json")
            };
        }
    }
}
