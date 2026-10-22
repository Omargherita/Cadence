using System.Text.Json.Serialization;
using Cadence.Api.Domain.MusicalLibrary;

namespace Cadence.Api.Domain.PianoMentor;

public class PieceWeakness
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid PieceId { get; set; }

    [JsonIgnore]
    public Piece? Piece { get; set; }

    public WeaknessCategory Category { get; set; }

    public string Location { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public WeaknessStatus Status { get; set; } = WeaknessStatus.Active;

    public int OccurrenceCount { get; set; } = 1;

    public int ConsecutiveCleanSessions { get; set; } = 0;

    public DateOnly? LastEvaluatedSessionDate { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Deterministic Weakness State Machine transition rule.
    /// Only transitions to Resolved when ConsecutiveCleanSessions >= 3 across distinct calendar dates.
    /// </summary>
    public void ApplyEvaluation(WeaknessEvaluationResult evaluation, DateOnly sessionDate)
    {
        switch (evaluation)
        {
            case WeaknessEvaluationResult.PersistedToday:
            case WeaknessEvaluationResult.RegressedToday:
                Status = WeaknessStatus.Active;
                OccurrenceCount++;
                ConsecutiveCleanSessions = 0;
                LastEvaluatedSessionDate = sessionDate;
                UpdatedAtUtc = DateTimeOffset.UtcNow;
                break;

            case WeaknessEvaluationResult.ImprovedToday:
                // Only count improvement once per distinct calendar date session
                if (LastEvaluatedSessionDate != sessionDate)
                {
                    ConsecutiveCleanSessions++;
                }

                LastEvaluatedSessionDate = sessionDate;
                Status = ConsecutiveCleanSessions >= 3
                    ? WeaknessStatus.Resolved
                    : WeaknessStatus.Improving;
                UpdatedAtUtc = DateTimeOffset.UtcNow;
                break;

            case WeaknessEvaluationResult.NotTestedToday:
                // No state change
                break;
        }
    }
}
