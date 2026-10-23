using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Domain.PianoMentor;

namespace Cadence.Api.Features.PianoMentor;

public static class WeaknessStateMachine
{
    /// <summary>
    /// Applies the deterministic epistemic guardrails and state machine transitions
    /// defined in AI Piano Mentor Contract v1.1.0.
    /// </summary>
    public static void ProcessAssessment(
        Piece piece,
        PracticeTake take,
        MentorAssessment assessment,
        DateOnly sessionDate,
        Action<PieceWeakness>? onWeaknessAdded = null)
    {
        // 1. Epistemic Post-Validation Guardrails
        // Disallow and strip video posture claims if video posture analysis was not requested or original media is audio
        if (!take.IncludeVideoPostureAnalysis || take.OriginalMediaType == OriginalMediaType.AudioMp3)
        {
            assessment.NewlyDetectedIssues.RemoveAll(i => i.EvidenceSource == EvidenceSource.VideoPosture);
        }

        foreach (var issue in assessment.NewlyDetectedIssues)
        {
            // Low confidence issues MUST NEVER be promoted to tracked weaknesses
            if (issue.ConfidenceLevel == ConfidenceLevel.Low)
            {
                issue.PromoteToTrackedWeakness = false;
            }
        }

        // 2. Evaluate existing weaknesses according to the deterministic state machine
        foreach (var eval in assessment.ExistingWeaknessEvaluations)
        {
            var weakness = piece.Weaknesses.FirstOrDefault(w => w.Id == eval.WeaknessId);
            if (weakness != null)
            {
                weakness.ApplyEvaluation(eval.Evaluation, sessionDate);
            }
        }

        // 3. Promote qualified newly detected issues to tracked weaknesses
        foreach (var issue in assessment.NewlyDetectedIssues)
        {
            if (issue.PromoteToTrackedWeakness && issue.ConfidenceLevel != ConfidenceLevel.Low)
            {
                var location = !string.IsNullOrWhiteSpace(issue.MeasureRange)
                    ? issue.MeasureRange
                    : (!string.IsNullOrWhiteSpace(issue.TimestampRange) ? issue.TimestampRange : take.TargetSection);

                // Avoid duplicating exact same category & location if already active
                var alreadyTracked = piece.Weaknesses.Any(w =>
                    w.Category == issue.Category &&
                    w.Location.Equals(location, StringComparison.OrdinalIgnoreCase) &&
                    w.Status != WeaknessStatus.Resolved);

                if (!alreadyTracked)
                {
                    var newWeakness = new PieceWeakness
                    {
                        Id = Guid.CreateVersion7(),
                        PieceId = piece.Id,
                        Category = issue.Category,
                        Location = location,
                        Description = issue.MusicalProblem,
                        Status = WeaknessStatus.Active,
                        OccurrenceCount = 1,
                        ConsecutiveCleanSessions = 0,
                        LastEvaluatedSessionDate = sessionDate,
                        UpdatedAtUtc = DateTimeOffset.UtcNow
                    };
                    piece.Weaknesses.Add(newWeakness);
                    onWeaknessAdded?.Invoke(newWeakness);
                }
            }
        }
    }
}
