export type DayArchetype =
  | 'UniversityDay'
  | 'DeepWorkDay'
  | 'DevelopmentAndPianoDay'
  | 'FlexibleRecoveryDay'
  | 'DeepWorkAndGymDay';

export type TaskCategory =
  | 'University'
  | 'DeepWork'
  | 'Piano'
  | 'Gym'
  | 'LifeAdmin';

export type RepertoireBucket =
  | 'MainChallenge'
  | 'Maintenance'
  | 'FutureExploration';

export type ScoreCapabilityTier =
  | 'None'
  | 'VisualPdfOnly'
  | 'MachineReadableAligned';

export type WeaknessCategory =
  | 'PitchAccuracy'
  | 'RhythmAndTempo'
  | 'DynamicsAndBalance'
  | 'Voicing'
  | 'ArticulationAndPedal'
  | 'PhrasingAndRubato'
  | 'PhysicalTension';

export type WeaknessStatus =
  | 'Active'
  | 'Improving'
  | 'Resolved';

export type TakeScope =
  | 'PassageClip'
  | 'FullPerformance';

export type MediaSourceQuality =
  | 'PhoneMicCompressed'
  | 'UncompressedAudio'
  | 'DirectMidi';

export type OriginalMediaType =
  | 'AudioMp3'
  | 'VideoMp4';

export type ComparisonVerdict =
  | 'ClearImprovement'
  | 'SlightImprovement'
  | 'NoChange'
  | 'Regressed'
  | 'FirstTakeInSession';

export type WeaknessEvaluationResult =
  | 'ImprovedToday'
  | 'PersistedToday'
  | 'RegressedToday'
  | 'NotTestedToday';

export type EvidenceSource =
  | 'ObjectiveDsp'
  | 'AudioPerceptual'
  | 'VideoPosture'
  | 'UserSelfReport';

export type ConfidenceLevel =
  | 'High'
  | 'Medium'
  | 'Low';

export interface PieceWeakness {
  id: string;
  pieceId: string;
  category: WeaknessCategory;
  location: string;
  description: string;
  status: WeaknessStatus;
  occurrenceCount: number;
  consecutiveCleanSessions: number;
  lastEvaluatedSessionDate: string | null;
  updatedAtUtc: string;
}

export interface CreateWeaknessRequest {
  category: WeaknessCategory;
  location: string;
  description: string;
}

export interface IntraSessionComparison {
  comparedAgainstTakeNumber: number | null;
  comparisonVerdict: ComparisonVerdict;
  whatChanged: string;
}

export interface EvidenceBreakdown {
  objectiveFindingsSummary: string;
  artisticAndInterpretiveJudgment: string;
}

export interface WeaknessEvaluation {
  weaknessId: string;
  evaluation: WeaknessEvaluationResult;
  timestampEvidence: string;
  reasoning: string;
}

export interface NewlyDetectedIssue {
  category: WeaknessCategory;
  timestampRange: string;
  measureRange: string;
  evidenceSource: EvidenceSource;
  confidenceLevel: ConfidenceLevel;
  musicalProblem: string;
  whyItMattersArtistically: string;
  promoteToTrackedWeakness: boolean;
}

export interface ImmediateNextTakeDrill {
  shouldRecordAnotherTakeNow: boolean;
  instruction: string;
  whatToListenFor: string;
  targetDurationMinutes: number;
}

export interface PracticePlanDrill {
  targetSection: string;
  linkedWeaknessId: string | null;
  practiceMethod: string;
  whatToListenFor: string;
  measurableSuccessCriteria: string;
  durationMinutes: number;
}

export interface NextSessionPracticePlan {
  isFinalizedForNextSession: boolean;
  recommendedDurationMinutes: number;
  drills: PracticePlanDrill[];
}

export interface MentorAssessment {
  schemaVersion: string;
  mentorCritique: string;
  analysisLimitationsNote: string;
  intraSessionComparison: IntraSessionComparison;
  evidenceBreakdown: EvidenceBreakdown;
  existingWeaknessEvaluations: WeaknessEvaluation[];
  newlyDetectedIssues: NewlyDetectedIssue[];
  diagnosticQuestionsForStudent: string[];
  immediateNextTakeDrill: ImmediateNextTakeDrill;
  nextSessionPracticePlan: NextSessionPracticePlan;
}

export interface PracticeTake {
  id: string;
  practiceSessionId: string;
  takeNumber: number;
  scope: TakeScope;
  targetSection: string;
  userSelfReflection: string;
  attachedPdfPages: string;
  includeVideoPostureAnalysis: boolean;
  originalMediaRelativePath: string;
  extractedAudioRelativePath: string;
  originalMediaType: OriginalMediaType;
  sourceQuality: MediaSourceQuality;
  durationSeconds: number | null;
  objectiveDspMetricsJson?: string | null;
  createdAtUtc: string;
  assessment: MentorAssessment | null;
}

export type RecurrencePattern = 'None' | 'Daily' | 'Weekdays' | 'Weekly';

export interface PendingTake {
  id: string;
  pieceId: string;
  sessionId: string;
  scope: TakeScope;
  targetSection: string;
  userSelfReflection: string;
  attachedPdfPages: string;
  includeVideoPostureAnalysis: boolean;
  mediaBlob: Blob;
  originalFileName: string;
  mimeType: string;
  createdAtUtc: string;
}

export interface TaskItem {
  id: string;
  title: string;
  category: TaskCategory;
  priority: number;
  recurrence?: RecurrencePattern;
  scheduledDate: string | null;
  isCompleted: boolean;
  completedAtUtc: string | null;
  updatedAtUtc: string;
}

export interface CreateTaskRequest {
  id?: string;
  title: string;
  category: TaskCategory;
  priority?: number;
  recurrence?: RecurrencePattern;
  scheduledDate?: string | null;
}

export interface PracticeSession {
  id: string;
  pieceId: string;
  startedAtUtc: string;
  durationMinutes: number;
  targetSection: string;
  userSelfReflection: string;
  nextSessionGoal: string;
  takes?: PracticeTake[];
}

export interface CreatePracticeSessionRequest {
  id?: string;
  startedAtUtc?: string;
  durationMinutes: number;
  targetSection?: string;
  userSelfReflection?: string;
  nextSessionGoal?: string;
}

export interface Piece {
  id: string;
  title: string;
  composer: string;
  bucket: RepertoireBucket;
  personalGoals: string;
  interpretationNotes: string;
  scoreCapabilityTier: ScoreCapabilityTier;
  scoreFilePath: string | null;
  lastPracticedAtUtc: string | null;
  updatedAtUtc: string;
  sessions: PracticeSession[];
  weaknesses?: PieceWeakness[];
}

export interface CreatePieceRequest {
  id?: string;
  title: string;
  composer: string;
  bucket: RepertoireBucket;
  personalGoals?: string;
  interpretationNotes?: string;
}

export interface HealthStatus {
  status: string;
  timestampUtc: string;
}

export interface DayArchetypeOption {
  type: DayArchetype;
  label: string;
  description: string;
  pianoTarget: string;
}

export const DAY_ARCHETYPES: DayArchetypeOption[] = [
  {
    type: 'UniversityDay',
    label: 'University Day',
    description: 'Academic lectures, coursework & labs',
    pianoTarget: '30m Piano Maintenance',
  },
  {
    type: 'DeepWorkDay',
    label: 'Deep Work Day',
    description: 'Autonomous research & deep cognitive blocks',
    pianoTarget: '45-60m Piano Focus',
  },
  {
    type: 'DevelopmentAndPianoDay',
    label: 'Development + Piano Day',
    description: 'Heavy engineering, software build & extended piano mastery',
    pianoTarget: '60-90m Immersion',
  },
  {
    type: 'FlexibleRecoveryDay',
    label: 'Flexible / Recovery Day',
    description: 'Light admin, rest, sight-reading & reflection',
    pianoTarget: 'Optional Sight-Reading',
  },
  {
    type: 'DeepWorkAndGymDay',
    label: 'Deep Work + Gym Day',
    description: 'Morning cognitive sprints & evening physical training',
    pianoTarget: '30m Technical Maintenance',
  },
];
