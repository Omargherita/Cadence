namespace Cadence.Api.Domain.PianoMentor;

public enum WeaknessCategory
{
    PitchAccuracy,
    RhythmAndTempo,
    DynamicsAndBalance,
    Voicing,
    ArticulationAndPedal,
    PhrasingAndRubato,
    PhysicalTension
}

public enum WeaknessStatus
{
    Active,
    Improving,
    Resolved
}

public enum TakeScope
{
    PassageClip,
    FullPerformance
}

public enum MediaSourceQuality
{
    PhoneMicCompressed,
    UncompressedAudio,
    DirectMidi
}

public enum OriginalMediaType
{
    AudioMp3,
    VideoMp4
}

public enum ComparisonVerdict
{
    ClearImprovement,
    SlightImprovement,
    NoChange,
    Regressed,
    FirstTakeInSession
}

public enum WeaknessEvaluationResult
{
    ImprovedToday,
    PersistedToday,
    RegressedToday,
    NotTestedToday
}

public enum EvidenceSource
{
    ObjectiveDsp,
    AudioPerceptual,
    VideoPosture,
    UserSelfReport
}

public enum ConfidenceLevel
{
    High,
    Medium,
    Low
}
