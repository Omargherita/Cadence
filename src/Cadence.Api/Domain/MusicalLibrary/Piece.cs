using Cadence.Api.Domain.PianoMentor;

namespace Cadence.Api.Domain.MusicalLibrary;

public class Piece
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public string Title { get; set; } = string.Empty;

    public string Composer { get; set; } = string.Empty;

    public RepertoireBucket Bucket { get; set; }

    public string PersonalGoals { get; set; } = string.Empty;

    public string InterpretationNotes { get; set; } = string.Empty;

    public ScoreCapabilityTier ScoreCapabilityTier { get; set; } = ScoreCapabilityTier.None;

    public string? ScoreFilePath { get; set; }

    public DateTimeOffset? LastPracticedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public List<PracticeSession> Sessions { get; set; } = [];

    public List<PieceWeakness> Weaknesses { get; set; } = [];
}
