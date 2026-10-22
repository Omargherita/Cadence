namespace Cadence.Api.Domain.PianoMentor;

public class MentorAssessment
{
    public string SchemaVersion { get; set; } = "1.1.0";

    public string MentorCritique { get; set; } = string.Empty;

    public string AnalysisLimitationsNote { get; set; } = string.Empty;

    public IntraSessionComparison IntraSessionComparison { get; set; } = new();

    public EvidenceBreakdown EvidenceBreakdown { get; set; } = new();

    public List<WeaknessEvaluation> ExistingWeaknessEvaluations { get; set; } = [];

    public List<NewlyDetectedIssue> NewlyDetectedIssues { get; set; } = [];

    public List<string> DiagnosticQuestionsForStudent { get; set; } = [];

    public ImmediateNextTakeDrill ImmediateNextTakeDrill { get; set; } = new();

    public NextSessionPracticePlan NextSessionPracticePlan { get; set; } = new();
}

public class IntraSessionComparison
{
    public int? ComparedAgainstTakeNumber { get; set; }

    public ComparisonVerdict ComparisonVerdict { get; set; } = ComparisonVerdict.FirstTakeInSession;

    public string WhatChanged { get; set; } = string.Empty;
}

public class EvidenceBreakdown
{
    public string ObjectiveFindingsSummary { get; set; } = string.Empty;

    public string ArtisticAndInterpretiveJudgment { get; set; } = string.Empty;
}

public class WeaknessEvaluation
{
    public Guid WeaknessId { get; set; }

    public WeaknessEvaluationResult Evaluation { get; set; } = WeaknessEvaluationResult.NotTestedToday;

    public string TimestampEvidence { get; set; } = string.Empty;

    public string Reasoning { get; set; } = string.Empty;
}

public class NewlyDetectedIssue
{
    public WeaknessCategory Category { get; set; }

    public string TimestampRange { get; set; } = string.Empty;

    public string MeasureRange { get; set; } = string.Empty;

    public EvidenceSource EvidenceSource { get; set; } = EvidenceSource.AudioPerceptual;

    public ConfidenceLevel ConfidenceLevel { get; set; } = ConfidenceLevel.Medium;

    public string MusicalProblem { get; set; } = string.Empty;

    public string WhyItMattersArtistically { get; set; } = string.Empty;

    public bool PromoteToTrackedWeakness { get; set; }
}

public class ImmediateNextTakeDrill
{
    public bool ShouldRecordAnotherTakeNow { get; set; }

    public string Instruction { get; set; } = string.Empty;

    public string WhatToListenFor { get; set; } = string.Empty;

    public int TargetDurationMinutes { get; set; } = 5;
}

public class NextSessionPracticePlan
{
    public bool IsFinalizedForNextSession { get; set; }

    public int RecommendedDurationMinutes { get; set; } = 30;

    public List<PracticePlanDrill> Drills { get; set; } = [];
}

public class PracticePlanDrill
{
    public string TargetSection { get; set; } = string.Empty;

    public Guid? LinkedWeaknessId { get; set; }

    public string PracticeMethod { get; set; } = string.Empty;

    public string WhatToListenFor { get; set; } = string.Empty;

    public string MeasurableSuccessCriteria { get; set; } = string.Empty;

    public int DurationMinutes { get; set; } = 10;
}
