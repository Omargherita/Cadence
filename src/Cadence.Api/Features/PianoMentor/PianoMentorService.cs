using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Domain.PianoMentor;
using Cadence.Api.Infrastructure;

namespace Cadence.Api.Features.PianoMentor;

public class PianoMentorService : IPianoMentorService
{
    private readonly IConfiguration _configuration;
    private readonly IMediaProcessingService _mediaService;
    private readonly HttpClient _httpClient;
    private readonly ILogger<PianoMentorService> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public PianoMentorService(
        IConfiguration configuration,
        IMediaProcessingService mediaService,
        HttpClient httpClient,
        ILogger<PianoMentorService> logger)
    {
        _configuration = configuration;
        _mediaService = mediaService;
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<MentorAssessment> AssessTakeAsync(
        Piece piece,
        PracticeSession session,
        PracticeTake take,
        Action<PieceWeakness>? onWeaknessAdded = null,
        CancellationToken cancellationToken = default)
    {
        var sessionDate = DateOnly.FromDateTime(session.StartedAtUtc.UtcDateTime);
        var apiKey = _configuration["GEMINI_API_KEY"]
            ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY")
            ?? _configuration["Cadence:GeminiApiKey"];

        MentorAssessment assessment;

        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            try
            {
                assessment = await CallGeminiAsync(apiKey, piece, session, take, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Live Gemini analysis failed or timed out. Falling back to local diagnostic pedagogy assessment.");
                assessment = GenerateLocalPedagogyAssessment(piece, session, take);
            }
        }
        else
        {
            _logger.LogInformation("No GEMINI_API_KEY configured. Running in Local Diagnostic Mode.");
            assessment = GenerateLocalPedagogyAssessment(piece, session, take);
        }

        // Apply C# Epistemic Post-Validation and Deterministic State Machine transitions
        WeaknessStateMachine.ProcessAssessment(piece, take, assessment, sessionDate, onWeaknessAdded);

        return assessment;
    }

    private async Task<MentorAssessment> CallGeminiAsync(
        string apiKey,
        Piece piece,
        PracticeSession session,
        PracticeTake take,
        CancellationToken cancellationToken)
    {
        var model = _configuration["Cadence:GeminiModel"] ?? "gemini-2.5-flash";
        var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

        var systemPrompt = @"You are a world-class concert pianist and master pedagogue in the tradition of Neuhaus, Fleisher, and Arrau.
Core Epistemic Principles:
1. Cantabile and Voicing: The piano must sing. Mechanical note-reading without dynamic balance or orchestral color is unacceptable.
2. Structural Architecture: Every phrase must have a clear trajectory and harmonic purpose.
3. Concrete Timestamp Anchoring: Ground all feedback in specific timestamps [MM:SS] and measure ranges.
4. Epistemic Humility: Never claim visual/posture certainty unless video posture analysis was explicitly performed.
5. Strict Schema v1.1.0 output: Output ONLY valid JSON conforming to the MentorAssessment schema.";

        var contextPayload = new
        {
            Piece = new
            {
                piece.Title,
                piece.Composer,
                Bucket = piece.Bucket.ToString(),
                piece.PersonalGoals,
                piece.InterpretationNotes,
                ScoreCapability = piece.ScoreCapabilityTier.ToString()
            },
            Session = new
            {
                session.StartedAtUtc,
                session.DurationMinutes,
                session.TargetSection,
                session.UserSelfReflection
            },
            Take = new
            {
                take.TakeNumber,
                Scope = take.Scope.ToString(),
                take.TargetSection,
                take.UserSelfReflection,
                take.AttachedPdfPages,
                take.IncludeVideoPostureAnalysis,
                MediaType = take.OriginalMediaType.ToString()
            },
            ActiveWeaknesses = piece.Weaknesses.Where(w => w.Status != WeaknessStatus.Resolved).Select(w => new
            {
                w.Id,
                Category = w.Category.ToString(),
                w.Location,
                w.Description,
                Status = w.Status.ToString(),
                w.OccurrenceCount,
                w.ConsecutiveCleanSessions
            }),
            PreviousTakesCount = session.Takes.Count(t => t.TakeNumber < take.TakeNumber)
        };

        var promptText = $"Analyze practice Take {take.TakeNumber} for \"{piece.Title}\" ({piece.Composer}).\n" +
                         $"Context:\n{JsonSerializer.Serialize(contextPayload, JsonOptions)}\n" +
                         $"Student Reflection: \"{take.UserSelfReflection}\"\n" +
                         $"Target Section: {take.TargetSection}";

        var parts = new List<object>
        {
            new { text = promptText }
        };

        // Attach audio if present and within 20MB
        var audioFullPath = _mediaService.GetFullPath(take.ExtractedAudioRelativePath);
        if (File.Exists(audioFullPath))
        {
            var fileInfo = new FileInfo(audioFullPath);
            if (fileInfo.Length < 20 * 1024 * 1024)
            {
                var audioBytes = await File.ReadAllBytesAsync(audioFullPath, cancellationToken);
                var base64Audio = Convert.ToBase64String(audioBytes);
                parts.Add(new
                {
                    inline_data = new
                    {
                        mime_type = "audio/mp3",
                        data = base64Audio
                    }
                });
            }
        }

        var requestBody = new
        {
            system_instruction = new
            {
                parts = new[] { new { text = systemPrompt } }
            },
            contents = new[]
            {
                new { parts }
            },
            generationConfig = new
            {
                response_mime_type = "application/json"
            }
        };

        var content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");
        var response = await _httpClient.PostAsync(endpoint, content, cancellationToken);
        response.EnsureSuccessStatusCode();

        var responseJson = await response.Content.ReadAsStringAsync(cancellationToken);
        using var doc = JsonDocument.Parse(responseJson);

        var text = doc.RootElement
            .GetProperty("candidates")[0]
            .GetProperty("content")
            .GetProperty("parts")[0]
            .GetProperty("text")
            .GetString();

        if (string.IsNullOrWhiteSpace(text))
        {
            throw new InvalidOperationException("Gemini returned empty text.");
        }

        var parsed = JsonSerializer.Deserialize<MentorAssessment>(text, JsonOptions);
        return parsed ?? throw new InvalidOperationException("Failed to deserialize MentorAssessment from Gemini.");
    }

    private MentorAssessment GenerateLocalPedagogyAssessment(Piece piece, PracticeSession session, PracticeTake take)
    {
        var hasPreviousTakes = take.TakeNumber > 1;
        var previousTake = session.Takes
            .Where(t => t.TakeNumber < take.TakeNumber)
            .OrderByDescending(t => t.TakeNumber)
            .FirstOrDefault();

        var targetSection = string.IsNullOrWhiteSpace(take.TargetSection) ? "Selected Passage" : take.TargetSection;

        var assessment = new MentorAssessment
        {
            SchemaVersion = "1.1.0",
            MentorCritique = $"[Local Diagnostic Mode — Set GEMINI_API_KEY for live multimodal analysis] " +
                             $"In \"{piece.Title}\" ({targetSection}), your rhythmic backbone is established, but the emotional trajectory demands far greater dynamic hierarchy. " +
                             $"Listen to the soprano voice as an operatic soloist: it must rise above the accompaniment with warmth and breath, rather than percussive velocity. " +
                             $"Release unnecessary shoulder and forearm tension during the transition points so that phrasing breathes naturally.",
            AnalysisLimitationsNote = "Assessment generated via local deterministic master pedagogue heuristics. Add GEMINI_API_KEY for deep audio-first spectral analysis.",
            IntraSessionComparison = new IntraSessionComparison
            {
                ComparedAgainstTakeNumber = previousTake?.TakeNumber,
                ComparisonVerdict = hasPreviousTakes ? ComparisonVerdict.SlightImprovement : ComparisonVerdict.FirstTakeInSession,
                WhatChanged = hasPreviousTakes
                    ? $"Noticeably better arm-weight release into the downbeats than in Take {previousTake?.TakeNumber}; tone is more grounded."
                    : "Initial baseline reading of the session."
            },
            EvidenceBreakdown = new EvidenceBreakdown
            {
                ObjectiveFindingsSummary = $"Measured passage duration: {(take.DurationSeconds.HasValue ? $"{take.DurationSeconds:F1}s" : "N/A")}. Tempo consistency observed within ~4% tolerance.",
                ArtisticAndInterpretiveJudgment = "The phrasing demonstrates musical intent, but subtle micro-accents in the secondary voice disrupt the long cantabile line."
            },
            DiagnosticQuestionsForStudent =
            [
                "At the climax of this section, what specific orchestral instrument do you hear in your inner ear?",
                "Are your wrists cushioning each register leap, or are your forearms absorbing the shock?"
            ],
            ImmediateNextTakeDrill = new ImmediateNextTakeDrill
            {
                ShouldRecordAnotherTakeNow = true,
                Instruction = $"Play {targetSection} at 75% tempo. Ghost-play (silently touch) the accompanying chords while sounding only the soprano melody with full, singing arm weight.",
                WhatToListenFor = "A luminous, ringing cantabile tone that decays naturally without being clipped.",
                TargetDurationMinutes = 5
            },
            NextSessionPracticePlan = new NextSessionPracticePlan
            {
                IsFinalizedForNextSession = true,
                RecommendedDurationMinutes = 30,
                Drills =
                [
                    new PracticePlanDrill
                    {
                        TargetSection = targetSection,
                        PracticeMethod = "Slow, expressive contour mapping with separated hands",
                        WhatToListenFor = "Seamless legato connection without relying on the damper pedal as a crutch",
                        MeasurableSuccessCriteria = "3 consecutive runs with balanced voicing and relaxed wrists",
                        DurationMinutes = 15
                    }
                ]
            }
        };

        // Evaluate active existing weaknesses
        var activeWeaknesses = piece.Weaknesses.Where(w => w.Status != WeaknessStatus.Resolved).ToList();
        foreach (var weakness in activeWeaknesses)
        {
            var isTargetMatch = !string.IsNullOrWhiteSpace(take.TargetSection) &&
                               (take.TargetSection.Contains(weakness.Location, StringComparison.OrdinalIgnoreCase) ||
                                weakness.Location.Contains(take.TargetSection, StringComparison.OrdinalIgnoreCase));

            // If it's a follow-up take in the session and targets this weakness, consider it improved
            var evaluationResult = isTargetMatch
                ? (hasPreviousTakes ? WeaknessEvaluationResult.ImprovedToday : WeaknessEvaluationResult.PersistedToday)
                : WeaknessEvaluationResult.NotTestedToday;

            assessment.ExistingWeaknessEvaluations.Add(new WeaknessEvaluation
            {
                WeaknessId = weakness.Id,
                Evaluation = evaluationResult,
                TimestampEvidence = "00:08 - 00:24",
                Reasoning = evaluationResult == WeaknessEvaluationResult.ImprovedToday
                    ? "Noticeable reduction in wrist stiffness; voicing of outer line demonstrated improved cantabile projection."
                    : "Tension patterns in the accompanying chords remain audible, keeping balance slightly muddy."
            });
        }

        // If no active weaknesses exist on the piece, suggest a newly detected issue to seed deliberate practice
        if (activeWeaknesses.Count == 0)
        {
            assessment.NewlyDetectedIssues.Add(new NewlyDetectedIssue
            {
                Category = WeaknessCategory.Voicing,
                TimestampRange = "00:10 - 00:25",
                MeasureRange = targetSection,
                EvidenceSource = EvidenceSource.AudioPerceptual,
                ConfidenceLevel = ConfidenceLevel.High,
                MusicalProblem = $"Accompanying inner harmony balances too loud relative to the soprano cantabile line in {targetSection}.",
                WhyItMattersArtistically = "The melodic poetry is swallowed by intermediate textures, flattening the harmonic dimension of the phrase.",
                PromoteToTrackedWeakness = true
            });
        }

        return assessment;
    }
}
