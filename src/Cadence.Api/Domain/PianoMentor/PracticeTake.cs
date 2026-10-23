using System.Text.Json.Serialization;
using Cadence.Api.Domain.MusicalLibrary;

namespace Cadence.Api.Domain.PianoMentor;

public class PracticeTake
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid PracticeSessionId { get; set; }

    [JsonIgnore]
    public PracticeSession? PracticeSession { get; set; }

    public int TakeNumber { get; set; } = 1;

    public TakeScope Scope { get; set; } = TakeScope.PassageClip;

    public string TargetSection { get; set; } = string.Empty;

    public string UserSelfReflection { get; set; } = string.Empty;

    public string AttachedPdfPages { get; set; } = string.Empty;

    public bool IncludeVideoPostureAnalysis { get; set; } = false;

    public string OriginalMediaRelativePath { get; set; } = string.Empty;

    public string ExtractedAudioRelativePath { get; set; } = string.Empty;

    public OriginalMediaType OriginalMediaType { get; set; } = OriginalMediaType.AudioMp3;

    public MediaSourceQuality SourceQuality { get; set; } = MediaSourceQuality.PhoneMicCompressed;

    public double? DurationSeconds { get; set; }

    public string? ObjectiveDspMetricsJson { get; set; }

    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public MentorAssessment? Assessment { get; set; }
}
