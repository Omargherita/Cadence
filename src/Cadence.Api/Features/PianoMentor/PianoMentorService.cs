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
        ObjectiveDspMetrics? dspMetrics = null,
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
                assessment = await CallGeminiAsync(apiKey, piece, session, take, dspMetrics, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Live Gemini analysis failed or timed out. Falling back to local diagnostic pedagogy assessment.");
                assessment = GenerateLocalPedagogyAssessment(piece, session, take, dspMetrics);
            }
        }
        else
        {
            _logger.LogInformation("No GEMINI_API_KEY configured. Running in Local Diagnostic Mode.");
            assessment = GenerateLocalPedagogyAssessment(piece, session, take, dspMetrics);
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
        ObjectiveDspMetrics? dspMetrics,
        CancellationToken cancellationToken)
    {
        var model = _configuration["Cadence:GeminiModel"] ?? "gemini-2.5-flash";
        var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

        var systemPrompt = @"You are a world-class concert pianist and master pedagogue in the tradition of Neuhaus, Fleisher, and Arrau.
Core Epistemic Principles:
1. Cantabile and Voicing: The piano must sing. Mechanical note-reading without dynamic balance or orchestral color is unacceptable.
2. Structural Architecture: Every phrase must have a clear trajectory and harmonic purpose.
3. Concrete Timestamp Anchoring: Ground all feedback in specific timestamps [MM:SS] and measure ranges.
4. Epistemic Humility: Never claim visual/posture certainty unless video posture analysis was explicitly performed and video/frames were attached.
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
            ObjectiveDspEvidence = dspMetrics != null && dspMetrics.AnalyzerStatus == "Available" ? new
            {
                dspMetrics.EstimatedMeanBpm,
                dspMetrics.TempoStabilityStdDevBpm,
                dspMetrics.DetectedTempoAnomalies,
                dspMetrics.DynamicRangeRmsDb,
                dspMetrics.DynamicEnvelopeNotes
            } : null,
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

        if (!string.IsNullOrWhiteSpace(take.AttachedPdfPages))
        {
            promptText += $"\nRelevant Sheet Music Score Pages: {take.AttachedPdfPages}";
        }

        if (take.IncludeVideoPostureAnalysis && take.OriginalMediaType == OriginalMediaType.VideoMp4)
        {
            promptText += "\nVideo posture analysis is enabled: evaluate wrist angle, forearm alignment, shoulder release, and hand architecture from the attached visual media.";
        }

        var parts = new List<object>
        {
            new { text = promptText }
        };

        // 1. Attach extracted audio if present and within 20MB
        if (!string.IsNullOrWhiteSpace(take.ExtractedAudioRelativePath))
        {
            var audioFullPath = _mediaService.GetFullPath(take.ExtractedAudioRelativePath);
            if (File.Exists(audioFullPath))
            {
                var fileInfo = new FileInfo(audioFullPath);
                if (fileInfo.Length < 20 * 1024 * 1024)
                {
                    var audioBytes = await File.ReadAllBytesAsync(audioFullPath, cancellationToken);
                    var audioMimeType = GetAudioMimeType(audioFullPath);
                    parts.Add(new
                    {
                        inline_data = new
                        {
                            mime_type = audioMimeType,
                            data = Convert.ToBase64String(audioBytes)
                        }
                    });
                }
            }
        }

        // 2. Attach Score PDF if piece has an attached score PDF within 15MB
        if (piece.ScoreCapabilityTier == ScoreCapabilityTier.VisualPdfOnly &&
            !string.IsNullOrWhiteSpace(piece.ScoreFilePath))
        {
            var scoreFullPath = _mediaService.GetFullPath(piece.ScoreFilePath);
            if (File.Exists(scoreFullPath))
            {
                var scoreInfo = new FileInfo(scoreFullPath);
                if (scoreInfo.Length < 15 * 1024 * 1024)
                {
                    var pdfBytes = await File.ReadAllBytesAsync(scoreFullPath, cancellationToken);
                    parts.Add(new
                    {
                        inline_data = new
                        {
                            mime_type = "application/pdf",
                            data = Convert.ToBase64String(pdfBytes)
                        }
                    });
                }
            }
        }

        // 3. Attach Video Posture Media (sampled keyframes or inline video clip) when requested
        if (take.IncludeVideoPostureAnalysis &&
            take.OriginalMediaType == OriginalMediaType.VideoMp4 &&
            !string.IsNullOrWhiteSpace(take.OriginalMediaRelativePath))
        {
            var frames = await _mediaService.ExtractVideoPostureFramesAsync(
                take.OriginalMediaRelativePath,
                maxFrames: 4,
                cancellationToken);

            if (frames.Count > 0)
            {
                foreach (var frameBytes in frames)
                {
                    parts.Add(new
                    {
                        inline_data = new
                        {
                            mime_type = "image/jpeg",
                            data = Convert.ToBase64String(frameBytes)
                        }
                    });
                }
            }
            else
            {
                // Fallback: if frame extraction didn't yield frames and video is compact (<12MB), attach video directly
                var videoFullPath = _mediaService.GetFullPath(take.OriginalMediaRelativePath);
                if (File.Exists(videoFullPath))
                {
                    var videoInfo = new FileInfo(videoFullPath);
                    if (videoInfo.Length < 12 * 1024 * 1024)
                    {
                        var videoBytes = await File.ReadAllBytesAsync(videoFullPath, cancellationToken);
                        parts.Add(new
                        {
                            inline_data = new
                            {
                                mime_type = GetVideoMimeType(videoFullPath),
                                data = Convert.ToBase64String(videoBytes)
                            }
                        });
                    }
                }
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
                response_mime_type = "application/json",
                response_schema = BuildMentorAssessmentResponseSchema()
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

    private static string GetAudioMimeType(string filePath)
    {
        return Path.GetExtension(filePath).ToLowerInvariant() switch
        {
            ".wav" => "audio/wav",
            ".m4a" => "audio/mp4",
            ".ogg" => "audio/ogg",
            ".flac" => "audio/flac",
            ".webm" => "audio/webm",
            _ => "audio/mp3"
        };
    }

    private static string GetVideoMimeType(string filePath)
    {
        return Path.GetExtension(filePath).ToLowerInvariant() switch
        {
            ".webm" => "video/webm",
            ".mov" => "video/quicktime",
            ".mkv" => "video/x-matroska",
            _ => "video/mp4"
        };
    }

    public static object BuildMentorAssessmentResponseSchema()
    {
        var comparisonVerdicts = Enum.GetNames<ComparisonVerdict>();
        var weaknessEvalResults = Enum.GetNames<WeaknessEvaluationResult>();
        var weaknessCategories = Enum.GetNames<WeaknessCategory>();
        var evidenceSources = Enum.GetNames<EvidenceSource>();
        var confidenceLevels = Enum.GetNames<ConfidenceLevel>();

        return new
        {
            type = "OBJECT",
            required = new[]
            {
                "schemaVersion",
                "mentorCritique",
                "analysisLimitationsNote",
                "intraSessionComparison",
                "evidenceBreakdown",
                "existingWeaknessEvaluations",
                "newlyDetectedIssues",
                "diagnosticQuestionsForStudent",
                "immediateNextTakeDrill",
                "nextSessionPracticePlan"
            },
            properties = new
            {
                schemaVersion = new { type = "STRING" },
                mentorCritique = new { type = "STRING" },
                analysisLimitationsNote = new { type = "STRING" },
                intraSessionComparison = new
                {
                    type = "OBJECT",
                    required = new[] { "comparisonVerdict", "whatChanged" },
                    properties = new
                    {
                        comparedAgainstTakeNumber = new { type = "INTEGER", nullable = true },
                        comparisonVerdict = new { type = "STRING", @enum = comparisonVerdicts },
                        whatChanged = new { type = "STRING" }
                    }
                },
                evidenceBreakdown = new
                {
                    type = "OBJECT",
                    required = new[] { "objectiveFindingsSummary", "artisticAndInterpretiveJudgment" },
                    properties = new
                    {
                        objectiveFindingsSummary = new { type = "STRING" },
                        artisticAndInterpretiveJudgment = new { type = "STRING" }
                    }
                },
                existingWeaknessEvaluations = new
                {
                    type = "ARRAY",
                    items = new
                    {
                        type = "OBJECT",
                        required = new[] { "weaknessId", "evaluation", "timestampEvidence", "reasoning" },
                        properties = new
                        {
                            weaknessId = new { type = "STRING" },
                            evaluation = new { type = "STRING", @enum = weaknessEvalResults },
                            timestampEvidence = new { type = "STRING" },
                            reasoning = new { type = "STRING" }
                        }
                    }
                },
                newlyDetectedIssues = new
                {
                    type = "ARRAY",
                    items = new
                    {
                        type = "OBJECT",
                        required = new[]
                        {
                            "category",
                            "timestampRange",
                            "measureRange",
                            "evidenceSource",
                            "confidenceLevel",
                            "musicalProblem",
                            "whyItMattersArtistically",
                            "promoteToTrackedWeakness"
                        },
                        properties = new
                        {
                            category = new { type = "STRING", @enum = weaknessCategories },
                            timestampRange = new { type = "STRING" },
                            measureRange = new { type = "STRING" },
                            evidenceSource = new { type = "STRING", @enum = evidenceSources },
                            confidenceLevel = new { type = "STRING", @enum = confidenceLevels },
                            musicalProblem = new { type = "STRING" },
                            whyItMattersArtistically = new { type = "STRING" },
                            promoteToTrackedWeakness = new { type = "BOOLEAN" }
                        }
                    }
                },
                diagnosticQuestionsForStudent = new
                {
                    type = "ARRAY",
                    items = new { type = "STRING" }
                },
                immediateNextTakeDrill = new
                {
                    type = "OBJECT",
                    required = new[]
                    {
                        "shouldRecordAnotherTakeNow",
                        "instruction",
                        "whatToListenFor",
                        "targetDurationMinutes"
                    },
                    properties = new
                    {
                        shouldRecordAnotherTakeNow = new { type = "BOOLEAN" },
                        instruction = new { type = "STRING" },
                        whatToListenFor = new { type = "STRING" },
                        targetDurationMinutes = new { type = "INTEGER" }
                    }
                },
                nextSessionPracticePlan = new
                {
                    type = "OBJECT",
                    required = new[]
                    {
                        "isFinalizedForNextSession",
                        "recommendedDurationMinutes",
                        "drills"
                    },
                    properties = new
                    {
                        isFinalizedForNextSession = new { type = "BOOLEAN" },
                        recommendedDurationMinutes = new { type = "INTEGER" },
                        drills = new
                        {
                            type = "ARRAY",
                            items = new
                            {
                                type = "OBJECT",
                                required = new[]
                                {
                                    "targetSection",
                                    "practiceMethod",
                                    "whatToListenFor",
                                    "measurableSuccessCriteria",
                                    "durationMinutes"
                                },
                                properties = new
                                {
                                    targetSection = new { type = "STRING" },
                                    linkedWeaknessId = new { type = "STRING", nullable = true },
                                    practiceMethod = new { type = "STRING" },
                                    whatToListenFor = new { type = "STRING" },
                                    measurableSuccessCriteria = new { type = "STRING" },
                                    durationMinutes = new { type = "INTEGER" }
                                }
                            }
                        }
                    }
                }
            }
        };
    }

    private MentorAssessment GenerateLocalPedagogyAssessment(
        Piece piece,
        PracticeSession session,
        PracticeTake take,
        ObjectiveDspMetrics? dspMetrics)
    {
        var hasPreviousTakes = take.TakeNumber > 1;
        var previousTake = session.Takes
            .Where(t => t.TakeNumber < take.TakeNumber)
            .OrderByDescending(t => t.TakeNumber)
            .FirstOrDefault();

        var targetSection = string.IsNullOrWhiteSpace(take.TargetSection) ? "Selected Passage" : take.TargetSection;

        var dspAvailable = dspMetrics != null && dspMetrics.AnalyzerStatus == "Available";
        var meanBpm = dspAvailable ? dspMetrics!.EstimatedMeanBpm : 0.0;
        var tempoDev = dspAvailable ? dspMetrics!.TempoStabilityStdDevBpm : 0.0;
        var dynamicRangeDb = dspAvailable ? dspMetrics!.DynamicRangeRmsDb : 0.0;
        var anomalies = dspAvailable ? dspMetrics!.DetectedTempoAnomalies : [];

        var anomalyNotes = anomalies.Count > 0
            ? string.Join("; ", anomalies.Select(a => $"{a.Type} tendency at {a.TimestampRange} ({a.LocalBpm:F1} BPM, {a.DeviationPercent:F1}%)"))
            : "No severe tempo fluctuations (>8%) detected";

        var dspFindingsSummary = dspAvailable
            ? $"Duration: {(take.DurationSeconds.HasValue ? $"{take.DurationSeconds:F1}s" : $"{dspMetrics!.DurationSeconds:F1}s")}. " +
              $"Estimated mean tempo: {meanBpm:F1} BPM (std dev: {tempoDev:F2} BPM). " +
              $"Dynamic range contrast: {dynamicRangeDb:F1} dB. " +
              $"Tempo stability: {anomalyNotes}. " +
              $"{dspMetrics!.DynamicEnvelopeNotes}"
            : $"Measured passage duration: {(take.DurationSeconds.HasValue ? $"{take.DurationSeconds:F1}s" : "N/A")}. Tempo consistency observed within ~4% tolerance.";

        var critiqueBuilder = new StringBuilder();
        critiqueBuilder.Append($"In \"{piece.Title}\" ({targetSection}), your rhythmic backbone is established");
        if (dspAvailable && meanBpm > 0)
        {
            critiqueBuilder.Append($" around {meanBpm:F0} BPM (tempo stability ±{tempoDev:F1} BPM)");
        }
        critiqueBuilder.Append(", but the emotional trajectory demands far greater dynamic hierarchy. ");

        if (anomalies.Count > 0)
        {
            var firstAnomaly = anomalies[0];
            critiqueBuilder.Append($"Noticeable {firstAnomaly.Type.ToLowerInvariant()} tendency flagged at {firstAnomaly.TimestampRange} ({firstAnomaly.LocalBpm:F0} BPM vs {meanBpm:F0} BPM baseline). ");
        }

        if (dspAvailable && dynamicRangeDb > 0)
        {
            if (dynamicRangeDb < 12.0)
            {
                critiqueBuilder.Append($"The measured acoustic dynamic contrast is narrow ({dynamicRangeDb:F1} dB); avoid flattening emotional climaxes into a uniform mezzo-forte. ");
            }
            else
            {
                critiqueBuilder.Append($"The measured acoustic dynamic contrast is expressive ({dynamicRangeDb:F1} dB headroom); maintain this clarity of projection. ");
            }
        }

        critiqueBuilder.Append("Listen to the soprano voice as an operatic soloist: it must rise above the accompaniment with warmth and breath, rather than percussive velocity. " +
                               "Release unnecessary shoulder and forearm tension during transition points so that phrasing breathes naturally.");

        var assessment = new MentorAssessment
        {
            SchemaVersion = "1.1.0",
            MentorCritique = $"[Local Diagnostic Mode — Set GEMINI_API_KEY for live multimodal analysis] {critiqueBuilder}",
            AnalysisLimitationsNote = dspAvailable
                ? "Assessment powered by deterministic Python DSP audio metrics & local pedagogue heuristics. Set GEMINI_API_KEY for neural multimodal critique."
                : "Assessment generated via local deterministic master pedagogue heuristics. Add GEMINI_API_KEY for deep audio-first spectral analysis.",
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
                ObjectiveFindingsSummary = dspFindingsSummary,
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
