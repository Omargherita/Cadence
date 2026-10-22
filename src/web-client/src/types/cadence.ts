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

export interface TaskItem {
  id: string;
  title: string;
  category: TaskCategory;
  priority: number;
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
  lastPracticedAtUtc: string | null;
  updatedAtUtc: string;
  sessions: PracticeSession[];
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
