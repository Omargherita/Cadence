using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Domain.PianoMentor;
using Cadence.Api.Features.PianoMentor;
using Xunit;

namespace Cadence.Api.Tests;

public class WeaknessStateMachineTests
{
    [Fact]
    public void SameCalendarDay_ThreeImprovedEvaluations_IncrementsConsecutiveCleanSessionsToOnlyOne()
    {
        // Arrange
        var pieceId = Guid.CreateVersion7();
        var weakness = new PieceWeakness
        {
            Id = Guid.CreateVersion7(),
            PieceId = pieceId,
            Category = WeaknessCategory.Voicing,
            Location = "Measures 1-16",
            Description = "Inner voice balance",
            Status = WeaknessStatus.Active,
            OccurrenceCount = 1,
            ConsecutiveCleanSessions = 0,
            LastEvaluatedSessionDate = null
        };

        var piece = new Piece
        {
            Id = pieceId,
            Title = "Ballade No. 1",
            Composer = "Chopin",
            Weaknesses = [weakness]
        };

        var sessionDate = new DateOnly(2026, 10, 23);

        // Act - 3 takes on the exact same date
        for (int takeNum = 1; takeNum <= 3; takeNum++)
        {
            var take = new PracticeTake
            {
                TakeNumber = takeNum,
                Scope = TakeScope.PassageClip,
                TargetSection = "Measures 1-16"
            };

            var assessment = new MentorAssessment
            {
                ExistingWeaknessEvaluations =
                [
                    new WeaknessEvaluation
                    {
                        WeaknessId = weakness.Id,
                        Evaluation = WeaknessEvaluationResult.ImprovedToday,
                        TimestampEvidence = "00:10 - 00:20",
                        Reasoning = $"Take {takeNum} clean voicing"
                    }
                ]
            };

            WeaknessStateMachine.ProcessAssessment(piece, take, assessment, sessionDate);
        }

        // Assert
        // Mastery rule: Multiple takes on the same day must only count as 1 clean session
        Assert.Equal(1, weakness.ConsecutiveCleanSessions);
        Assert.Equal(WeaknessStatus.Improving, weakness.Status);
        Assert.Equal(sessionDate, weakness.LastEvaluatedSessionDate);
    }

    [Fact]
    public void ThreeDistinctCalendarDates_ThreeImprovedEvaluations_TransitionsToResolved()
    {
        // Arrange
        var pieceId = Guid.CreateVersion7();
        var weakness = new PieceWeakness
        {
            Id = Guid.CreateVersion7(),
            PieceId = pieceId,
            Category = WeaknessCategory.RhythmAndTempo,
            Location = "Measures 208-264",
            Description = "Tempo rushing at coda entry",
            Status = WeaknessStatus.Active,
            OccurrenceCount = 1,
            ConsecutiveCleanSessions = 0,
            LastEvaluatedSessionDate = null
        };

        var piece = new Piece
        {
            Id = pieceId,
            Title = "Ballade No. 1",
            Composer = "Chopin",
            Weaknesses = [weakness]
        };

        var dates = new[]
        {
            new DateOnly(2026, 10, 23),
            new DateOnly(2026, 10, 24),
            new DateOnly(2026, 10, 25)
        };

        // Act - 3 evaluations across 3 distinct calendar dates
        for (int i = 0; i < dates.Length; i++)
        {
            var take = new PracticeTake
            {
                TakeNumber = i + 1,
                Scope = TakeScope.PassageClip,
                TargetSection = "Measures 208-264"
            };

            var assessment = new MentorAssessment
            {
                ExistingWeaknessEvaluations =
                [
                    new WeaknessEvaluation
                    {
                        WeaknessId = weakness.Id,
                        Evaluation = WeaknessEvaluationResult.ImprovedToday,
                        TimestampEvidence = "00:15 - 00:30",
                        Reasoning = $"Day {i + 1} clean tempo"
                    }
                ]
            };

            WeaknessStateMachine.ProcessAssessment(piece, take, assessment, dates[i]);

            if (i < 2)
            {
                Assert.Equal(i + 1, weakness.ConsecutiveCleanSessions);
                Assert.Equal(WeaknessStatus.Improving, weakness.Status);
            }
        }

        // Assert
        Assert.Equal(3, weakness.ConsecutiveCleanSessions);
        Assert.Equal(WeaknessStatus.Resolved, weakness.Status);
        Assert.Equal(dates[2], weakness.LastEvaluatedSessionDate);
    }

    [Theory]
    [InlineData(WeaknessEvaluationResult.PersistedToday)]
    [InlineData(WeaknessEvaluationResult.RegressedToday)]
    public void RegressionOrPersistence_OnImprovingWeakness_ResetsConsecutiveCleanSessionsAndRevertsToActive(
        WeaknessEvaluationResult failureResult)
    {
        // Arrange - Weakness has 2 consecutive clean sessions and is Improving
        var pieceId = Guid.CreateVersion7();
        var weakness = new PieceWeakness
        {
            Id = Guid.CreateVersion7(),
            PieceId = pieceId,
            Category = WeaknessCategory.PhysicalTension,
            Location = "Descending double octaves",
            Description = "Forearm stiffness",
            Status = WeaknessStatus.Improving,
            OccurrenceCount = 2,
            ConsecutiveCleanSessions = 2,
            LastEvaluatedSessionDate = new DateOnly(2026, 10, 24)
        };

        var piece = new Piece
        {
            Id = pieceId,
            Title = "Ballade No. 1",
            Composer = "Chopin",
            Weaknesses = [weakness]
        };

        var newSessionDate = new DateOnly(2026, 10, 25);
        var take = new PracticeTake
        {
            TakeNumber = 1,
            Scope = TakeScope.PassageClip,
            TargetSection = "Descending double octaves"
        };

        var assessment = new MentorAssessment
        {
            ExistingWeaknessEvaluations =
            [
                new WeaknessEvaluation
                {
                    WeaknessId = weakness.Id,
                    Evaluation = failureResult,
                    TimestampEvidence = "00:08 - 00:20",
                    Reasoning = "Tension resurfaced in LH wrist"
                }
            ]
        };

        // Act
        WeaknessStateMachine.ProcessAssessment(piece, take, assessment, newSessionDate);

        // Assert - ConsecutiveCleanSessions reset to 0, occurrence count incremented, status reverted to Active
        Assert.Equal(0, weakness.ConsecutiveCleanSessions);
        Assert.Equal(3, weakness.OccurrenceCount);
        Assert.Equal(WeaknessStatus.Active, weakness.Status);
        Assert.Equal(newSessionDate, weakness.LastEvaluatedSessionDate);
    }

    [Fact]
    public void EpistemicGuardrails_IncludeVideoPostureAnalysisFalse_StripsVideoPostureIssues()
    {
        // Arrange
        var piece = new Piece
        {
            Id = Guid.CreateVersion7(),
            Title = "Clair de Lune",
            Composer = "Debussy"
        };

        var take = new PracticeTake
        {
            TakeNumber = 1,
            IncludeVideoPostureAnalysis = false, // Posture analysis NOT enabled
            OriginalMediaType = OriginalMediaType.VideoMp4
        };

        var assessment = new MentorAssessment
        {
            NewlyDetectedIssues =
            [
                new NewlyDetectedIssue
                {
                    Category = WeaknessCategory.PhysicalTension,
                    MeasureRange = "Measures 15-20",
                    EvidenceSource = EvidenceSource.VideoPosture, // Should be stripped
                    ConfidenceLevel = ConfidenceLevel.High,
                    MusicalProblem = "Elevated right shoulder during reach",
                    PromoteToTrackedWeakness = true
                },
                new NewlyDetectedIssue
                {
                    Category = WeaknessCategory.DynamicsAndBalance,
                    MeasureRange = "Measures 27-36",
                    EvidenceSource = EvidenceSource.AudioPerceptual, // Should remain
                    ConfidenceLevel = ConfidenceLevel.High,
                    MusicalProblem = "Bass notes masking melody",
                    PromoteToTrackedWeakness = true
                }
            ]
        };

        var sessionDate = new DateOnly(2026, 10, 23);

        // Act
        WeaknessStateMachine.ProcessAssessment(piece, take, assessment, sessionDate);

        // Assert
        // The VideoPosture issue must be stripped from NewlyDetectedIssues
        Assert.Single(assessment.NewlyDetectedIssues);
        Assert.DoesNotContain(assessment.NewlyDetectedIssues, i => i.EvidenceSource == EvidenceSource.VideoPosture);
        Assert.Contains(assessment.NewlyDetectedIssues, i => i.Category == WeaknessCategory.DynamicsAndBalance);

        // Only the audio issue should be promoted to tracked weaknesses
        Assert.Single(piece.Weaknesses);
        Assert.Equal(WeaknessCategory.DynamicsAndBalance, piece.Weaknesses[0].Category);
    }

    [Fact]
    public void EpistemicGuardrails_AudioOnlyMedia_StripsVideoPostureIssuesEvenIfFlaggedTrue()
    {
        // Arrange
        var piece = new Piece
        {
            Id = Guid.CreateVersion7(),
            Title = "Nocturne Op. 9 No. 2",
            Composer = "Chopin"
        };

        var take = new PracticeTake
        {
            TakeNumber = 1,
            IncludeVideoPostureAnalysis = true,
            OriginalMediaType = OriginalMediaType.AudioMp3 // Audio only! Cannot have video posture certainty
        };

        var assessment = new MentorAssessment
        {
            NewlyDetectedIssues =
            [
                new NewlyDetectedIssue
                {
                    Category = WeaknessCategory.PhysicalTension,
                    EvidenceSource = EvidenceSource.VideoPosture,
                    ConfidenceLevel = ConfidenceLevel.Medium,
                    MusicalProblem = "Elbow flare",
                    PromoteToTrackedWeakness = false
                }
            ]
        };

        // Act
        WeaknessStateMachine.ProcessAssessment(piece, take, assessment, new DateOnly(2026, 10, 23));

        // Assert
        Assert.Empty(assessment.NewlyDetectedIssues);
    }

    [Fact]
    public void EpistemicGuardrails_LowConfidenceIssue_CannotBePromotedToTrackedWeakness()
    {
        // Arrange
        var piece = new Piece
        {
            Id = Guid.CreateVersion7(),
            Title = "Waldstein Sonata",
            Composer = "Beethoven"
        };

        var take = new PracticeTake
        {
            TakeNumber = 1,
            IncludeVideoPostureAnalysis = false,
            OriginalMediaType = OriginalMediaType.AudioMp3
        };

        var assessment = new MentorAssessment
        {
            NewlyDetectedIssues =
            [
                new NewlyDetectedIssue
                {
                    Category = WeaknessCategory.PitchAccuracy,
                    MeasureRange = "Measures 75-80",
                    EvidenceSource = EvidenceSource.AudioPerceptual,
                    ConfidenceLevel = ConfidenceLevel.Low,
                    MusicalProblem = "Possible missed accidental in LH",
                    PromoteToTrackedWeakness = true // Tentatively set true by LLM
                }
            ]
        };

        // Act
        WeaknessStateMachine.ProcessAssessment(piece, take, assessment, new DateOnly(2026, 10, 23));

        // Assert
        // Low confidence issue MUST have PromoteToTrackedWeakness forced to false
        Assert.Single(assessment.NewlyDetectedIssues);
        Assert.False(assessment.NewlyDetectedIssues[0].PromoteToTrackedWeakness);

        // Weakness must NOT be added to piece
        Assert.Empty(piece.Weaknesses);
    }
}
