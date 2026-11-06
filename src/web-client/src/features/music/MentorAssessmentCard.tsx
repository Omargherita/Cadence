import React, { FC } from 'react';
import {
  Activity,
  AlertCircle,
  Award,
  CheckCircle2,
  Clock,
  Compass,
  FileQuestion,
  Headphones,
  HelpCircle,
  ListTodo,
  Music,
  Play,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  ConfidenceLevel,
  EvidenceSource,
  MentorAssessment,
  PieceWeakness,
  WeaknessEvaluationResult,
  ComparisonVerdict,
} from '../../types/cadence';
import { parseTimestampToSeconds } from '../../utils/timestamp';

interface MentorAssessmentCardProps {
  assessment: MentorAssessment;
  weaknesses?: PieceWeakness[];
  onSeekTimestamp?: (seconds: number) => void;
}

const VERDICT_CONFIG: Record<ComparisonVerdict, { label: string; badge: string; icon: React.ReactNode }> = {
  ClearImprovement: {
    label: 'Clear Improvement',
    badge: 'text-blue-300 bg-blue-950/70 border-blue-700/80',
    icon: <TrendingUp className="w-3.5 h-3.5 text-blue-400" />,
  },
  SlightImprovement: {
    label: 'Slight Improvement',
    badge: 'text-blue-300 bg-blue-950/50 border-blue-800/60',
    icon: <TrendingUp className="w-3.5 h-3.5 text-blue-400" />,
  },
  NoChange: {
    label: 'No Significant Change',
    badge: 'text-slate-300 bg-slate-800/50 border-slate-700/60',
    icon: <RotateCcw className="w-3.5 h-3.5 text-slate-400" />,
  },
  Regressed: {
    label: 'Tension / Precision Regressed',
    badge: 'text-amber-300 bg-amber-950/70 border-amber-700/80',
    icon: <TrendingDown className="w-3.5 h-3.5 text-amber-400" />,
  },
  FirstTakeInSession: {
    label: 'Initial Baseline Take',
    badge: 'text-violet-300 bg-violet-950/60 border-violet-800/60',
    icon: <Sparkles className="w-3.5 h-3.5 text-violet-400" />,
  },
};

const EVALUATION_CONFIG: Record<WeaknessEvaluationResult, { label: string; badge: string }> = {
  ImprovedToday: {
    label: 'Improved Today',
    badge: 'text-blue-300 bg-blue-950/60 border-blue-800/60 font-semibold',
  },
  PersistedToday: {
    label: 'Persisted Today',
    badge: 'text-amber-300 bg-amber-950/60 border-amber-800/60 font-semibold',
  },
  RegressedToday: {
    label: 'Regressed Today',
    badge: 'text-amber-400 bg-amber-950/80 border-amber-700/80 font-semibold',
  },
  NotTestedToday: {
    label: 'Not Tested In Take',
    badge: 'text-slate-400 bg-slate-900/60 border-slate-800',
  },
};

const CONFIDENCE_BADGES: Record<ConfidenceLevel, string> = {
  High: 'text-blue-300 bg-blue-950/50 border-blue-800/50',
  Medium: 'text-violet-300 bg-violet-950/50 border-violet-800/50',
  Low: 'text-slate-400 bg-slate-800/50 border-slate-700/50',
};

const EVIDENCE_SOURCE_LABELS: Record<EvidenceSource, string> = {
  ObjectiveDsp: 'Objective DSP Analysis',
  AudioPerceptual: 'Perceptual Audio Analysis',
  VideoPosture: 'Video Posture Analysis',
  UserSelfReport: 'Self-Report Correlation',
};

export const MentorAssessmentCard: FC<MentorAssessmentCardProps> = ({
  assessment,
  weaknesses = [],
  onSeekTimestamp,
}) => {
  const comparison = assessment.intraSessionComparison;
  const comparisonConfig = comparison
    ? VERDICT_CONFIG[comparison.comparisonVerdict] || VERDICT_CONFIG.NoChange
    : null;

  const handleSeek = (timestampStr: string) => {
    if (!onSeekTimestamp || !timestampStr) return;
    const seconds = parseTimestampToSeconds(timestampStr);
    onSeekTimestamp(seconds);
  };

  const getWeaknessMeta = (weaknessId: string) => {
    const found = weaknesses.find((w) => w.id === weaknessId);
    if (!found) return { location: 'Tracked Weakness', category: 'General' };
    return { location: found.location, category: found.category };
  };

  return (
    <div className="space-y-4 pt-2">
      {/* Mentor Header & Epistemic Limitations */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#1E2638]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-violet-950/70 text-violet-400 border border-violet-800/60">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#F0F4F8] tracking-tight">
              AI Piano Mentor Assessment
            </h4>
            <span className="text-xs font-mono text-slate-400">
              Contract Schema {assessment.schemaVersion || 'v1.1.0'}
            </span>
          </div>
        </div>

        {comparisonConfig && (
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-mono font-medium ${comparisonConfig.badge}`}>
              {comparisonConfig.icon}
              {comparisonConfig.label}
              {comparison?.comparedAgainstTakeNumber !== null && (
                <span className="text-slate-400 ml-1">
                  (vs Take #{comparison.comparedAgainstTakeNumber})
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Intra-Session Comparison Detail Note */}
      {comparison && comparison.whatChanged && (
        <div className="document-section p-3     text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-blue-400  ">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Intra-Session Evolution</span>
          </div>
          <p className="text-slate-300 leading-relaxed">
            {comparison.whatChanged}
          </p>
        </div>
      )}

      {/* Maestro Critique Hero */}
      <div className="document-section relative        p-4 sm:p-5   space-y-2">
        <div className="flex items-center gap-2 text-xs font-mono font-semibold text-violet-400  ">
          <Award className="w-4 h-4 text-violet-400" />
          <span>Maestro Critique</span>
        </div>
        <p className="text-sm sm:text-base  text-[#F0F4F8] leading-relaxed">
          "{assessment.mentorCritique}"
        </p>

        {assessment.analysisLimitationsNote && (
          <div className="pt-2 text-xs text-slate-400 font-mono flex items-center gap-1.5 border-t border-[#1E2638]/60 mt-3">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{assessment.analysisLimitationsNote}</span>
          </div>
        )}
      </div>

      {/* Dual Evidence Breakdown (Objective DSP vs Artistic Judgment) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div className="document-section     p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-blue-400  ">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            <span>Objective Acoustic & DSP Findings</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
            {assessment.evidenceBreakdown?.objectiveFindingsSummary || 'No anomaly flagged in DSP spectra.'}
          </p>
        </div>

        <div className="document-section     p-3.5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-violet-400  ">
            <Headphones className="w-3.5 h-3.5 text-violet-400" />
            <span>Artistic & Interpretive Judgment</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
            {assessment.evidenceBreakdown?.artisticAndInterpretiveJudgment || 'Interpretive phrasing balanced.'}
          </p>
        </div>
      </div>

      {/* Existing Weakness Evaluations */}
      {assessment.existingWeaknessEvaluations && assessment.existingWeaknessEvaluations.length > 0 && (
        <div className="document-section     p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              <h5 className="text-xs font-semibold text-[#F0F4F8]   font-mono">
                Tracked Weakness State Evaluations ({assessment.existingWeaknessEvaluations.length})
              </h5>
            </div>
          </div>

          <div className="space-y-2">
            {assessment.existingWeaknessEvaluations.map((evalItem, idx) => {
              const meta = getWeaknessMeta(evalItem.weaknessId);
              const config = EVALUATION_CONFIG[evalItem.evaluation] || EVALUATION_CONFIG.NotTestedToday;

              return (
                <div
                  key={`${evalItem.weaknessId}-${idx}`}
                  className="rounded-lg bg-[#0B0E14] border border-[#1E2638] p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#F0F4F8]">
                        {meta.location}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        ({meta.category})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-mono border ${config.badge}`}>
                        {config.label}
                      </span>
                      {evalItem.timestampEvidence && (
                        <button
                          type="button"
                          onClick={() => handleSeek(evalItem.timestampEvidence)}
                          title="Click to seek media player to timestamp"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-semibold bg-blue-950/70 hover:bg-blue-900/80 text-blue-300 border border-blue-700/60 transition-colors cursor-pointer"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>{evalItem.timestampEvidence}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-300">
                    {evalItem.reasoning}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Newly Detected Issues */}
      {assessment.newlyDetectedIssues && assessment.newlyDetectedIssues.length > 0 && (
        <div className="document-section     p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <h5 className="text-xs font-semibold text-[#F0F4F8]   font-mono">
                Newly Detected Pedagogical Issues ({assessment.newlyDetectedIssues.length})
              </h5>
            </div>
          </div>

          <div className="space-y-2.5">
            {assessment.newlyDetectedIssues.map((issue, idx) => (
              <div
                key={idx}
                className="rounded-lg bg-[#0B0E14] border border-[#1E2638] p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#F0F4F8]">
                      {issue.category} • {issue.measureRange}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-mono border ${CONFIDENCE_BADGES[issue.confidenceLevel] || CONFIDENCE_BADGES.Medium}`}>
                      {issue.confidenceLevel} Confidence
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400">
                      {EVIDENCE_SOURCE_LABELS[issue.evidenceSource] || issue.evidenceSource}
                    </span>
                    {issue.timestampRange && (
                      <button
                        type="button"
                        onClick={() => handleSeek(issue.timestampRange)}
                        title="Click to seek media player to timestamp"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-semibold bg-blue-950/70 hover:bg-blue-900/80 text-blue-300 border border-blue-700/60 transition-colors cursor-pointer"
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>{issue.timestampRange}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <p className="text-slate-200">
                    <strong className="text-amber-300">Issue:</strong> {issue.musicalProblem}
                  </p>
                  <p className="text-slate-400 italic">
                    <strong className="not-italic text-slate-300 font-medium">Musical Impact:</strong> {issue.whyItMattersArtistically}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Diagnostic Questions for Student */}
      {assessment.diagnosticQuestionsForStudent && assessment.diagnosticQuestionsForStudent.length > 0 && (
        <div className="document-section     p-4 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-violet-400  ">
            <FileQuestion className="w-3.5 h-3.5" />
            <span>Introspective Diagnostic Questions</span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {assessment.diagnosticQuestionsForStudent.map((q, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-violet-400 font-mono font-semibold shrink-0">
                  {idx + 1}.
                </span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Immediate Next-Take Drill */}
      {assessment.immediateNextTakeDrill && (
        <div className="document-section        p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-blue-400" />
              <h5 className="text-xs font-semibold text-[#F0F4F8]   font-mono">
                Immediate Next-Take Micro-Drill
              </h5>
            </div>
            {assessment.immediateNextTakeDrill.targetDurationMinutes > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-mono text-blue-300 bg-blue-950/60 border border-blue-800/60 px-2 py-0.5 rounded">
                <Clock className="w-3 h-3 text-blue-400" />
                {assessment.immediateNextTakeDrill.targetDurationMinutes} mins
              </span>
            )}
          </div>

          <div className="space-y-1.5 text-xs">
            <p className="text-[#F0F4F8] font-medium leading-relaxed">
              {assessment.immediateNextTakeDrill.instruction}
            </p>
            {assessment.immediateNextTakeDrill.whatToListenFor && (
              <p className="text-slate-300 bg-[#0B0E14]/80 p-2.5 rounded-lg border border-[#1E2638]">
                <strong className="text-blue-300 font-mono font-semibold">What to listen for: </strong>
                {assessment.immediateNextTakeDrill.whatToListenFor}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Next Session Practice Plan (if finalized/present) */}
      {assessment.nextSessionPracticePlan?.drills && assessment.nextSessionPracticePlan.drills.length > 0 && (
        <div className="document-section     p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-violet-400" />
              <h5 className="text-xs font-semibold text-[#F0F4F8]   font-mono">
                Next Session Practice Plan ({assessment.nextSessionPracticePlan.recommendedDurationMinutes} mins)
              </h5>
            </div>
          </div>

          <div className="space-y-2">
            {assessment.nextSessionPracticePlan.drills.map((drill, idx) => (
              <div
                key={idx}
                className="rounded-lg bg-[#0B0E14] border border-[#1E2638] p-3 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#F0F4F8] flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-violet-400" />
                    {drill.targetSection}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {drill.durationMinutes} mins
                  </span>
                </div>

                <p className="text-slate-300">
                  <strong className="text-violet-300 font-mono">Method: </strong>
                  {drill.practiceMethod}
                </p>

                <p className="text-slate-300">
                  <strong className="text-blue-300 font-mono">Criteria: </strong>
                  {drill.measurableSuccessCriteria}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
