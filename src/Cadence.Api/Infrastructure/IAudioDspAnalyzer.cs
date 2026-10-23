namespace Cadence.Api.Infrastructure;

public class DetectedTempoAnomaly
{
    public string TimestampRange { get; set; } = string.Empty;
    public double LocalBpm { get; set; }
    public double DeviationPercent { get; set; }
    public string Type { get; set; } = string.Empty; // "Rushing" | "Dragging"
}

public class ObjectiveDspMetrics
{
    public string AnalyzerStatus { get; set; } = "Unavailable";
    public double DurationSeconds { get; set; }
    public double EstimatedMeanBpm { get; set; }
    public double TempoStabilityStdDevBpm { get; set; }
    public List<DetectedTempoAnomaly> DetectedTempoAnomalies { get; set; } = [];
    public double DynamicRangeRmsDb { get; set; }
    public string DynamicEnvelopeNotes { get; set; } = string.Empty;
    public string? RawJson { get; set; }
}

public interface IAudioDspAnalyzer
{
    Task<ObjectiveDspMetrics> AnalyzeAudioAsync(string audioFilePath, CancellationToken ct = default);
}
