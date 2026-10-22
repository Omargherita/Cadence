using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Domain.PianoMentor;

namespace Cadence.Api.Features.MusicalLibrary;

public record CreatePieceRequest(
    Guid? Id,
    string Title,
    string Composer,
    RepertoireBucket Bucket,
    string? PersonalGoals,
    string? InterpretationNotes
);

public record CreatePracticeSessionRequest(
    Guid? Id,
    DateTimeOffset? StartedAtUtc,
    int DurationMinutes,
    string? TargetSection,
    string? UserSelfReflection,
    string? NextSessionGoal
);

public record PracticeSessionResponse(
    Guid Id,
    Guid PieceId,
    DateTimeOffset StartedAtUtc,
    int DurationMinutes,
    string TargetSection,
    string UserSelfReflection,
    string NextSessionGoal,
    List<PracticeTake>? Takes = null
);

public record PieceResponse(
    Guid Id,
    string Title,
    string Composer,
    RepertoireBucket Bucket,
    string PersonalGoals,
    string InterpretationNotes,
    ScoreCapabilityTier ScoreCapabilityTier,
    string? ScoreFilePath,
    DateTimeOffset? LastPracticedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    List<PracticeSessionResponse> Sessions,
    List<PieceWeakness>? Weaknesses = null
);

