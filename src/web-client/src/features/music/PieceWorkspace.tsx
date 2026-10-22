import React, { FC, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Clock,
  Compass,
  History,
  Music,
  Plus,
  Target,
  Zap,
} from 'lucide-react';
import { CreatePracticeSessionRequest, Piece, RepertoireBucket } from '../../types/cadence';
import { formatDateTime, formatRelativeTime } from '../../utils/date';

interface PieceWorkspaceProps {
  piece: Piece;
  onBack: () => void;
  onLogSession: (pieceId: string, req: CreatePracticeSessionRequest) => Promise<void>;
  isLoading?: boolean;
}

const BUCKET_LABELS: Record<RepertoireBucket, { label: string; badge: string }> = {
  MainChallenge: {
    label: 'Main Challenge',
    badge: 'text-violet-300 bg-violet-950/50 border-violet-800/60 font-semibold',
  },
  Maintenance: {
    label: 'Maintenance',
    badge: 'text-blue-300 bg-blue-950/50 border-blue-800/60 font-semibold',
  },
  FutureExploration: {
    label: 'Future Exploration',
    badge: 'text-slate-300 bg-slate-800/50 border-slate-700/60 font-medium',
  },
};

const DURATION_PRESETS = [15, 30, 45, 60, 90];

export const PieceWorkspace: FC<PieceWorkspaceProps> = ({
  piece,
  onBack,
  onLogSession,
}) => {
  const [duration, setDuration] = useState<number>(30);
  const [targetSection, setTargetSection] = useState('');
  const [selfReflection, setSelfReflection] = useState('');
  const [nextGoal, setNextGoal] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bucketInfo = BUCKET_LABELS[piece.bucket] || BUCKET_LABELS.MainChallenge;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duration <= 0 || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onLogSession(piece.id, {
        durationMinutes: duration,
        targetSection: targetSection.trim(),
        userSelfReflection: selfReflection.trim(),
        nextSessionGoal: nextGoal.trim(),
      });
      // Clear inputs for next time
      setTargetSection('');
      setSelfReflection('');
      setNextGoal('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Top Bar with Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#111622] hover:bg-[#1A202C] text-slate-300 hover:text-white border border-[#1E2638] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Repertoire Board</span>
        </button>

        <span className="text-xs font-mono text-slate-400">
          Last Practiced: {formatRelativeTime(piece.lastPracticedAtUtc)}
        </span>
      </div>

      {/* Piece Overview Hero Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-[#111622] via-[#141A29] to-[#111622] border border-[#1E2638] p-6 shadow-xl shadow-black/40 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-md border text-xs font-mono ${bucketInfo.badge}`}>
                {bucketInfo.label}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {piece.sessions.length} recorded session{piece.sessions.length === 1 ? '' : 's'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F0F4F8]">
              {piece.title}
            </h1>
            <p className="text-sm font-semibold text-violet-400 font-mono">
              {piece.composer}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="px-4 py-2 rounded-xl bg-[#0B0E14] border border-[#1E2638] text-right">
              <span className="block text-[10px] uppercase font-mono tracking-wider text-slate-400">
                Total Focus
              </span>
              <span className="text-base font-bold text-blue-400 font-mono">
                {piece.sessions.reduce((acc, s) => acc + s.durationMinutes, 0)} mins
              </span>
            </div>
          </div>
        </div>

        {/* Goals & Interpretation Notes */}
        {(piece.personalGoals || piece.interpretationNotes) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[#1E2638]">
            {piece.personalGoals && (
              <div className="rounded-xl bg-[#0B0E14]/60 border border-[#1E2638] p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400 font-semibold uppercase tracking-wider">
                  <Target className="w-3.5 h-3.5" />
                  <span>Personal Mastery Goal</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300">
                  {piece.personalGoals}
                </p>
              </div>
            )}

            {piece.interpretationNotes && (
              <div className="rounded-xl bg-[#0B0E14]/60 border border-[#1E2638] p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-mono text-blue-400 font-semibold uppercase tracking-wider">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Interpretation & Nuance</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300">
                  {piece.interpretationNotes}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Workspace Grid: Log Session Form (Left) & History (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form: Log Practice Session */}
        <div className="lg:col-span-5 rounded-2xl bg-[#111622] border border-[#1E2638] p-5 shadow-lg shadow-black/30 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E2638]">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-950/70 text-violet-400 border border-violet-800/60">
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-[#F0F4F8] tracking-tight">
                Log Practice Session
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Live Monolith Sync</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Duration Selector */}
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                Session Duration
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDuration(preset)}
                    className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-all cursor-pointer ${
                      duration === preset
                        ? 'bg-blue-600 text-white font-bold ring-1 ring-blue-400 shadow-sm'
                        : 'bg-[#0B0E14] text-slate-400 border border-[#1E2638] hover:bg-[#1A202C]'
                    }`}
                  >
                    {preset}m
                  </button>
                ))}
                <div className="flex items-center gap-1 bg-[#0B0E14] border border-[#1E2638] rounded-lg px-2 py-1">
                  <input
                    type="number"
                    min="1"
                    max="600"
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                    className="w-12 bg-transparent text-center font-mono text-xs text-white outline-none"
                  />
                  <span className="text-slate-400 text-[11px] font-mono">min</span>
                </div>
              </div>
            </div>

            {/* Target Section */}
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                Target Section
              </label>
              <input
                type="text"
                value={targetSection}
                onChange={(e) => setTargetSection(e.target.value)}
                placeholder="e.g. Measures 208-264 (Coda), LH leap precision"
                className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-violet-500 rounded-xl px-3.5 py-2.5 text-xs text-[#F0F4F8] placeholder-slate-500 outline-none transition-colors"
              />
            </div>

            {/* Self-Reflection */}
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                Self-Reflection & Tension Notes
              </label>
              <textarea
                value={selfReflection}
                onChange={(e) => setSelfReflection(e.target.value)}
                rows={3}
                placeholder="What felt tense or improved? Dynamics, wrist flexibility, tempo rubato pacing..."
                className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-violet-500 rounded-xl px-3.5 py-2.5 text-xs text-[#F0F4F8] placeholder-slate-500 outline-none transition-colors resize-none"
              />
            </div>

            {/* Next Session Goal */}
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                Next Session Goal
              </label>
              <input
                type="text"
                value={nextGoal}
                onChange={(e) => setNextGoal(e.target.value)}
                placeholder="e.g. Push metronome to 132 bpm without tension"
                className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-violet-500 rounded-xl px-3.5 py-2.5 text-xs text-[#F0F4F8] placeholder-slate-500 outline-none transition-colors"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={duration <= 0 || isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold text-xs sm:text-sm transition-all shadow-md shadow-violet-600/20 active:scale-98 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Record Practice Session</span>
            </button>
          </form>
        </div>

        {/* History: Persistent Session History List */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-[#F0F4F8] tracking-tight">
                Practice History
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {piece.sessions.length} logged
            </span>
          </div>

          {piece.sessions.length > 0 ? (
            <div className="space-y-3">
              {piece.sessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-xl bg-[#111622] border border-[#1E2638] p-4 shadow-sm space-y-2 hover:border-slate-700 transition-colors"
                >
                  {/* Session Header */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-blue-950/50 text-blue-300 border border-blue-800/60">
                        <Clock className="w-3 h-3 text-blue-400" />
                        {session.durationMinutes}m
                      </span>
                      {session.targetSection && (
                        <span className="text-xs font-medium text-[#F0F4F8]">
                          {session.targetSection}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      {formatDateTime(session.startedAtUtc)}
                    </span>
                  </div>

                  {/* Reflection Notes */}
                  {session.userSelfReflection && (
                    <p className="text-xs text-slate-300 bg-[#0B0E14] rounded-lg p-2.5 border border-[#1E2638]/60">
                      {session.userSelfReflection}
                    </p>
                  )}

                  {/* Next Goal */}
                  {session.nextSessionGoal && (
                    <div className="flex items-start gap-1.5 text-xs text-violet-300 bg-violet-950/30 rounded-lg px-2.5 py-1.5 border border-violet-800/40">
                      <Compass className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                      <span>
                        <strong className="font-semibold text-violet-200">Next Target:</strong>{' '}
                        {session.nextSessionGoal}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-[#111622]/40 border border-[#1E2638] p-8 text-center space-y-2">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-800/60 text-slate-400 mb-1">
                <Music className="w-5 h-5 text-violet-400" />
              </div>
              <p className="text-sm font-medium text-[#F0F4F8]">
                No practice sessions recorded yet.
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Log your first focused work block using the form to build a deliberate practice trail.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
