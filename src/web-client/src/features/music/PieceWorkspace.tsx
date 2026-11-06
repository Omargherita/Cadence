import React, { FC, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Clock,
  Compass,
  FileText,
  History,
  Mic,
  Music,
  Plus,
  Radio,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import {
  CreatePracticeSessionRequest,
  CreateWeaknessRequest,
  PendingTake,
  Piece,
  PieceWeakness,
  PracticeTake,
  RepertoireBucket,
} from '../../types/cadence';
import { api, isPermanentApiError } from '../../services/api';
import { cadenceRepository } from '../../services/cadenceRepository';
import { syncEngine } from '../../services/syncEngine';
import { formatDateTime, formatRelativeTime } from '../../utils/date';
import { ScoreViewerModal } from './ScoreViewerModal';
import { WeaknessTrackerPanel } from './WeaknessTrackerPanel';
import { TakeStudioModal, TakeUploadMetadata } from './TakeStudioModal';
import { TakePlayerCard } from './TakePlayerCard';

interface PieceWorkspaceProps {
  piece: Piece;
  onBack: () => void;
  onLogSession: (pieceId: string, req: CreatePracticeSessionRequest) => Promise<void>;
  onRefresh?: () => Promise<void>;
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
  onRefresh,
}) => {
  // Score & Viewer Modals
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [isTakeStudioOpen, setIsTakeStudioOpen] = useState(false);
  const [isUploadingScore, setIsUploadingScore] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Weaknesses
  const [weaknesses, setWeaknesses] = useState<PieceWeakness[]>(piece.weaknesses || []);

  // Selected Session for Takes
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    piece.sessions.length > 0 ? piece.sessions[0].id : null
  );
  const [sessionTakes, setSessionTakes] = useState<PracticeTake[]>([]);
  const [pendingTakes, setPendingTakes] = useState<PendingTake[]>([]);
  const [isLoadingTakes, setIsLoadingTakes] = useState(false);

  // Log Practice Session Form State
  const [duration, setDuration] = useState<number>(30);
  const [targetSection, setTargetSection] = useState('');
  const [selfReflection, setSelfReflection] = useState('');
  const [nextGoal, setNextGoal] = useState('');
  const [isSubmittingSession, setIsSubmittingSession] = useState(false);

  const bucketInfo = BUCKET_LABELS[piece.bucket] || BUCKET_LABELS.MainChallenge;
  const hasScore = piece.scoreCapabilityTier === 'VisualPdfOnly' && Boolean(piece.scoreFilePath);

  // Keep weaknesses in sync with piece prop or reload
  useEffect(() => {
    if (piece.weaknesses) {
      setWeaknesses(piece.weaknesses);
    } else {
      loadWeaknesses();
    }
  }, [piece.id, piece.weaknesses]);

  // Keep selectedSessionId valid when sessions list updates
  useEffect(() => {
    if (piece.sessions.length > 0) {
      if (!selectedSessionId || !piece.sessions.some((s) => s.id === selectedSessionId)) {
        setSelectedSessionId(piece.sessions[0].id);
      }
    } else {
      setSelectedSessionId(null);
    }
  }, [piece.sessions, selectedSessionId]);

  // Load takes & pending offline takes for selected session
  useEffect(() => {
    if (selectedSessionId) {
      loadTakesForSession(selectedSessionId);
      loadPendingTakes();
    } else {
      setSessionTakes([]);
      setPendingTakes([]);
    }
  }, [selectedSessionId, piece.id]);

  // Subscribe to sync engine status to auto-refresh takes when background sync drains pending queue
  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((status) => {
      if (!status.isSyncing) {
        loadPendingTakes();
        if (selectedSessionId) {
          loadTakesForSession(selectedSessionId);
        }
      }
    });
    return () => unsubscribe();
  }, [piece.id, selectedSessionId]);

  const loadWeaknesses = async () => {
    try {
      const data = await api.getWeaknesses(piece.id);
      setWeaknesses(data);
    } catch (err) {
      console.error('Failed to load weaknesses', err);
    }
  };

  const loadPendingTakes = async () => {
    if (!selectedSessionId) {
      setPendingTakes([]);
      return;
    }
    const takes = await cadenceRepository.getPendingTakes(piece.id, selectedSessionId);
    setPendingTakes(takes);
  };

  const loadTakesForSession = async (sessionId: string) => {
    try {
      setIsLoadingTakes(true);
      // Check if takes already present in piece session
      const foundSession = piece.sessions.find((s) => s.id === sessionId);
      if (foundSession?.takes && foundSession.takes.length > 0) {
        setSessionTakes(foundSession.takes);
      }
      // Query freshest from API
      const data = await api.getTakes(piece.id, sessionId);
      setSessionTakes(data);
    } catch (err) {
      console.error('Failed to load takes for session', err);
    } finally {
      setIsLoadingTakes(false);
    }
  };

  const handleScoreUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    try {
      setIsUploadingScore(true);
      setScoreError(null);
      await api.uploadScore(piece.id, file);
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      setScoreError(err?.message || 'Failed to upload score PDF');
    } finally {
      setIsUploadingScore(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddWeakness = async (req: CreateWeaknessRequest) => {
    const created = await api.addWeakness(piece.id, req);
    setWeaknesses((prev) => [created, ...prev]);
    if (onRefresh) await onRefresh();
  };

  const handleUploadTake = async (formData: FormData, metadata: TakeUploadMetadata) => {
    if (!selectedSessionId) return;

    try {
      await api.uploadTake(piece.id, selectedSessionId, formData);
      await loadTakesForSession(selectedSessionId);
      await loadWeaknesses();
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      // The host answered and rejected the take (e.g. 400/404/413): retrying later can't help,
      // so report it to the user rather than queueing it offline forever.
      if (isPermanentApiError(err)) {
        throw err;
      }

      console.warn('Network upload failed, queueing take offline in IndexedDB', err);
      const pendingTake: PendingTake = {
        id: crypto.randomUUID(),
        pieceId: piece.id,
        sessionId: selectedSessionId,
        scope: metadata.scope,
        targetSection: metadata.targetSection,
        userSelfReflection: metadata.userSelfReflection,
        attachedPdfPages: metadata.attachedPdfPages,
        includeVideoPostureAnalysis: metadata.includeVideoPostureAnalysis,
        mediaBlob: metadata.file,
        originalFileName: metadata.file.name,
        mimeType: metadata.file.type || (metadata.file.name.endsWith('.mp4') ? 'video/mp4' : 'audio/mp3'),
        createdAtUtc: new Date().toISOString(),
      };
      await cadenceRepository.queueOfflineTake(pendingTake);
      await loadPendingTakes();
    }
  };

  const handleDeletePendingTake = async (id: string) => {
    await cadenceRepository.deletePendingTake(id);
    await loadPendingTakes();
  };

  const handleSubmitSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duration <= 0 || isSubmittingSession) return;

    try {
      setIsSubmittingSession(true);
      await onLogSession(piece.id, {
        durationMinutes: duration,
        targetSection: targetSection.trim(),
        userSelfReflection: selfReflection.trim(),
        nextSessionGoal: nextGoal.trim(),
      });
      setTargetSection('');
      setSelfReflection('');
      setNextGoal('');
      if (onRefresh) await onRefresh();
    } finally {
      setIsSubmittingSession(false);
    }
  };

  const activeSession = piece.sessions.find((s) => s.id === selectedSessionId);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Bar with Navigation */}
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

          <div className="flex items-center gap-3 shrink-0">
            <div className="px-4 py-2.5 rounded-xl bg-[#0B0E14] border border-[#1E2638] text-right">
              <span className="block text-[10px] uppercase font-mono tracking-wider text-slate-400">
                Total Focus
              </span>
              <span className="text-base sm:text-lg font-bold text-blue-400 font-mono">
                {piece.sessions.reduce((acc, s) => acc + s.durationMinutes, 0)} mins
              </span>
            </div>
          </div>
        </div>

        {/* Goals & Nuance Interpretation Notes */}
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

      {/* Score Context & Epistemic Tier Banner */}
      <div className="rounded-2xl bg-[#111622] border border-[#1E2638] p-5 shadow-lg shadow-black/30 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              hasScore
                ? 'bg-blue-950/70 text-blue-400 border-blue-800/60'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}>
              <FileText className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#F0F4F8]">
                  Score Capability Tier:
                </h3>
                <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold border ${
                  hasScore
                    ? 'bg-blue-950/50 text-blue-300 border-blue-800/60'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}>
                  {hasScore ? 'Visual PDF Score Attached' : 'No Score Attached'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {hasScore
                  ? 'Sheet music is stored locally. AI Piano Mentor correlates audio with measure references.'
                  : 'Attach a sheet music PDF to provide score context for AI pedagogical feedback.'}
              </p>
            </div>
          </div>

          {/* Score Action Buttons */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="application/pdf"
              onChange={handleScoreUpload}
              className="hidden"
            />

            {hasScore ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsScoreModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 transition-all cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>View Score</span>
                </button>
                <button
                  type="button"
                  disabled={isUploadingScore}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#0B0E14] hover:bg-[#1A202C] text-slate-300 hover:text-white border border-[#1E2638] transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-400" />
                  <span>{isUploadingScore ? 'Uploading...' : 'Replace PDF'}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isUploadingScore}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isUploadingScore ? 'Uploading PDF...' : 'Attach Sheet Music PDF'}</span>
              </button>
            )}
          </div>
        </div>

        {scoreError && (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300 font-mono">
            {scoreError}
          </div>
        )}

        {/* Epistemic Transparency Note */}
        <div className="flex items-start gap-2 pt-2 border-t border-[#1E2638] text-[11px] text-slate-400 font-mono">
          <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
          <span>
            {hasScore
              ? 'Audio-First + Visual Score Mode active: Timing stability, dynamics, and expressive phrasing evaluated. Exact MIDI/MusicXML note-accuracy alignment queued for future tiers.'
              : 'Audio-Only Analysis active: Timing stability, rubato pacing, and acoustic dynamics evaluated. Attach PDF score to unlock measure citations.'}
          </span>
        </div>
      </div>

      {/* Persistent Weakness State Machine Panel */}
      <WeaknessTrackerPanel
        weaknesses={weaknesses}
        onAddWeakness={handleAddWeakness}
      />

      {/* Practice Studio & Multi-Take Section */}
      <div className="rounded-2xl bg-[#111622] border border-[#1E2638] p-5 shadow-lg shadow-black/30 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2638]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-violet-950/70 text-violet-400 border border-violet-800/60">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#F0F4F8] tracking-tight">
                Interactive Multi-Take Studio
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                Acoustic takes, video posture analysis & AI Maestro feedback
              </span>
            </div>
          </div>

          {selectedSessionId && (
            <button
              type="button"
              onClick={() => setIsTakeStudioOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/20 active:scale-98 transition-all cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Record / Upload Take</span>
            </button>
          )}
        </div>

        {/* Session Selector Strip */}
        {piece.sessions.length > 0 ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                Select Practice Session
              </label>
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {piece.sessions.map((session) => {
                  const isSelected = session.id === selectedSessionId;
                  const takeCount =
                    (session.takes?.length || (isSelected ? sessionTakes.length : 0)) +
                    (isSelected ? pendingTakes.length : 0);

                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setSelectedSessionId(session.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-mono transition-all shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-950/60 border-blue-500/80 ring-1 ring-blue-500 text-white shadow-md'
                          : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:bg-[#1A202C]'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      <span>{formatDateTime(session.startedAtUtc)}</span>
                      <span className="text-slate-400">({session.durationMinutes}m)</span>
                      {takeCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-violet-950/80 text-violet-300 border border-violet-800/60">
                          {takeCount} take{takeCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Session Info Banner */}
            {activeSession && (
              <div className="p-3.5 rounded-xl bg-[#0B0E14] border border-[#1E2638] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#F0F4F8]">
                      {activeSession.targetSection ? `Target: ${activeSession.targetSection}` : 'Entire Repertoire Piece'}
                    </span>
                    <span className="font-mono text-slate-400">
                      • {activeSession.durationMinutes} minutes
                    </span>
                  </div>
                  {activeSession.userSelfReflection && (
                    <p className="text-slate-400 italic">
                      "{activeSession.userSelfReflection}"
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsTakeStudioOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white shrink-0 cursor-pointer shadow-sm shadow-violet-600/30"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Take #{sessionTakes.length + pendingTakes.length + 1}</span>
                </button>
              </div>
            )}

            {/* Takes List for the Active Session */}
            {isLoadingTakes ? (
              <div className="p-8 text-center text-xs font-mono text-slate-400">
                Loading practice takes...
              </div>
            ) : (sessionTakes.length > 0 || pendingTakes.length > 0) ? (
              <div className="space-y-5">
                {/* 1. Pending Offline Takes */}
                {pendingTakes.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5 text-amber-400" />
                        <span>Offline Queued Takes ({pendingTakes.length})</span>
                      </h4>
                      <span className="text-[11px] font-mono text-slate-400">
                        Awaiting Host Connection
                      </span>
                    </div>

                    {pendingTakes.map((take) => (
                      <div
                        key={take.id}
                        className="rounded-2xl bg-[#141A29] border border-amber-800/60 p-4 space-y-3 shadow-lg shadow-black/40"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#1E2638]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-950/60 text-amber-300 border border-amber-800/70 flex items-center gap-1.5 animate-pulse">
                              <Radio className="w-3.5 h-3.5 text-amber-400" />
                              <span>Queued for Maestro Analysis (Waiting for Host)</span>
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-violet-950/40 text-violet-300 border border-violet-800/50">
                              {take.scope}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-slate-400">
                              {formatDateTime(take.createdAtUtc)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeletePendingTake(take.id)}
                              className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-[#1A202C] transition-colors cursor-pointer"
                              title="Discard queued take"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                              Media File
                            </span>
                            <span className="text-[#F0F4F8] font-mono text-[11px] truncate block">
                              {take.originalFileName} ({(take.mediaBlob.size / (1024 * 1024)).toFixed(2)} MB)
                            </span>
                          </div>
                          {take.targetSection && (
                            <div>
                              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                                Target Section
                              </span>
                              <span className="text-slate-200 text-xs">
                                {take.targetSection}
                              </span>
                            </div>
                          )}
                        </div>

                        {take.userSelfReflection && (
                          <p className="text-xs text-slate-300 bg-[#0B0E14] rounded-lg p-2.5 border border-[#1E2638]">
                            "{take.userSelfReflection}"
                          </p>
                        )}

                        {take.syncError ? (
                          <div className="flex items-start gap-1.5 p-2.5 rounded-lg bg-amber-950/40 border border-amber-800/60 text-[11px] font-mono text-amber-300">
                            <Upload className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <span>
                              The host rejected this take and it will not be retried: {take.syncError}. Discard it
                              and upload a corrected file.
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                            <Upload className="w-3.5 h-3.5 text-blue-400" />
                            <span>Stored safely in Dexie. Will upload and trigger Maestro assessment when backend is reached.</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 2. Completed Session Takes */}
                {sessionTakes.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5 text-blue-400" />
                        <span>Session Takes ({sessionTakes.length})</span>
                      </h4>
                      <span className="text-[11px] font-mono text-slate-400">
                        Latest take evaluated first
                      </span>
                    </div>

                    <div className="space-y-4">
                      {sessionTakes
                        .slice()
                        .reverse()
                        .map((take, idx) => (
                          <TakePlayerCard
                            key={take.id}
                            take={take}
                            weaknesses={weaknesses}
                            isLatest={idx === 0}
                          />
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-[#0B0E14] border border-[#1E2638] p-8 text-center space-y-3">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-violet-950/50 text-violet-400 border border-violet-800/50">
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#F0F4F8]">
                    No takes recorded for this session yet.
                  </p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                    Upload an audio clip (.mp3, .wav) or video (.mp4) to summon the AI Piano Mentor critique, objective DSP breakdown, and instant drills.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTakeStudioOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/30 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Upload First Take</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-[#0B0E14] border border-[#1E2638] p-6 text-center space-y-2">
            <p className="text-sm font-semibold text-[#F0F4F8]">
              No practice sessions logged yet.
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Log your practice session below to initialize the multi-take studio and start tracking takes.
            </p>
          </div>
        )}
      </div>

      {/* Log Practice Session & Legacy History Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Form: Log Practice Session */}
        <div className="lg:col-span-5 rounded-2xl bg-[#111622] border border-[#1E2638] p-5 shadow-lg shadow-black/30 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1E2638]">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-violet-950/70 text-violet-400 border border-violet-800/60">
                <Zap className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-[#F0F4F8] tracking-tight">
                Log New Practice Session
              </h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Live Monolith Sync</span>
          </div>

          <form onSubmit={handleSubmitSession} className="space-y-4 text-xs">
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
              disabled={duration <= 0 || isSubmittingSession}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold text-xs sm:text-sm transition-all shadow-md shadow-violet-600/20 active:scale-98 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Record Practice Session</span>
            </button>
          </form>
        </div>

        {/* History: Session History Log */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-[#F0F4F8] tracking-tight">
                Session History Log
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
                  onClick={() => setSelectedSessionId(session.id)}
                  className={`rounded-xl bg-[#111622] border p-4 shadow-sm space-y-2 cursor-pointer transition-colors ${
                    session.id === selectedSessionId
                      ? 'border-blue-500/80 ring-1 ring-blue-500/30'
                      : 'border-[#1E2638] hover:border-slate-700'
                  }`}
                >
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

                  {session.userSelfReflection && (
                    <p className="text-xs text-slate-300 bg-[#0B0E14] rounded-lg p-2.5 border border-[#1E2638]/60">
                      {session.userSelfReflection}
                    </p>
                  )}

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

      {/* Score Viewer Modal */}
      <ScoreViewerModal
        isOpen={isScoreModalOpen}
        onClose={() => setIsScoreModalOpen(false)}
        pieceId={piece.id}
        pieceTitle={piece.title}
        composer={piece.composer}
      />

      {/* Take Studio Modal */}
      <TakeStudioModal
        isOpen={isTakeStudioOpen}
        onClose={() => setIsTakeStudioOpen(false)}
        pieceTitle={piece.title}
        defaultTargetSection={activeSession?.targetSection || ''}
        onUploadTake={handleUploadTake}
      />
    </div>
  );
};
