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
}
