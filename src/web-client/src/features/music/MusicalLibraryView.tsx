import { FC, useState } from 'react';
import {
  Clock,
  Compass,
  Flame,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  CreatePieceRequest,
  CreatePracticeSessionRequest,
  Piece,
  RepertoireBucket,
} from '../../types/cadence';
import { AddPieceModal } from './AddPieceModal';
import { PieceWorkspace } from './PieceWorkspace';
import { formatRelativeTime } from '../../utils/date';

interface MusicalLibraryViewProps {
  pieces: Piece[];
  selectedPieceId: string | null;
  onSelectPiece: (id: string | null) => void;
  onCreatePiece: (req: CreatePieceRequest) => Promise<void>;
  onLogSession: (pieceId: string, req: CreatePracticeSessionRequest) => Promise<void>;
  onRefreshPieces: () => Promise<void>;
  isLoading: boolean;
}

const BUCKET_CONFIG: Record<
  RepertoireBucket,
  {
    title: string;
    subtitle: string;
    icon: typeof Flame;
    color: string;
    badge: string;
  }
> = {
  MainChallenge: {
    title: 'Main Challenge',
    subtitle: 'Active deep focus repertoire demanding rigorous mastery',
    icon: Flame,
    color: 'text-violet-400',
    badge: 'bg-violet-950/50 text-violet-300 border-violet-800/60',
  },
  Maintenance: {
    title: 'Maintenance',
    subtitle: 'Learned repertoire retained with deliberate periodic practice',
    icon: Sparkles,
    color: 'text-blue-400',
    badge: 'bg-blue-950/50 text-blue-300 border-blue-800/60',
  },
  FutureExploration: {
    title: 'Future Exploration',
    subtitle: 'Queued backlog for sight-reading and upcoming study',
    icon: Compass,
    color: 'text-slate-400',
    badge: 'bg-slate-800/50 text-slate-300 border-slate-700/60',
  },
};

export const MusicalLibraryView: FC<MusicalLibraryViewProps> = ({
  pieces,
  selectedPieceId,
  onSelectPiece,
  onCreatePiece,
  onLogSession,
  onRefreshPieces,
  isLoading,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // If a piece is actively selected, show its dedicated workspace view
  const activePiece = pieces.find((p) => p.id === selectedPieceId);
  if (activePiece) {
    return (
      <PieceWorkspace
        piece={activePiece}
        onBack={() => onSelectPiece(null)}
        onLogSession={onLogSession}
        onRefresh={onRefreshPieces}
        isLoading={isLoading}
      />
    );
  }

  const buckets: RepertoireBucket[] = ['MainChallenge', 'Maintenance', 'FutureExploration'];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#111622] border border-[#1E2638] shadow-lg shadow-black/20">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F0F4F8]">
              Musical Library & Repertoire
            </h2>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-violet-950/60 text-violet-300 border border-violet-800/60">
              {pieces.length} Pieces
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Deliberate piano practice board organized by mastery depth and retention cycles.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onRefreshPieces}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-[#0B0E14] border border-[#1E2638] text-slate-400 hover:text-white hover:bg-[#1A202C] transition-colors cursor-pointer"
            title="Refresh repertoire"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-violet-400' : ''}`} />
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs sm:text-sm shadow-md shadow-violet-600/20 active:scale-98 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Piece</span>
          </button>
        </div>
      </div>

      {/* Repertoire Board (3 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {buckets.map((bucketKey) => {
          const config = BUCKET_CONFIG[bucketKey];
          const Icon = config.icon;
          const bucketPieces = pieces.filter((p) => p.bucket === bucketKey);

          return (
            <div
              key={bucketKey}
              className="rounded-2xl bg-[#111622]/80 border border-[#1E2638] p-4 sm:p-5 flex flex-col space-y-4"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#1E2638]">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] ${config.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F0F4F8] tracking-tight">
                      {config.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      {config.subtitle}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-[#0B0E14] text-slate-400 border border-[#1E2638]">
                  {bucketPieces.length}
                </span>
              </div>

              {/* Pieces List in this Bucket */}
              <div className="space-y-3 min-h-[140px]">
                {bucketPieces.length > 0 ? (
                  bucketPieces.map((piece) => (
                    <div
                      key={piece.id}
                      onClick={() => onSelectPiece(piece.id)}
                      className="group p-4 rounded-xl bg-[#0B0E14] hover:bg-[#141A29] border border-[#1E2638] hover:border-violet-600/60 shadow-sm transition-all duration-150 cursor-pointer space-y-2.5"
                    >
                      {/* Piece Title & Composer */}
                      <div>
                        <h4 className="text-sm font-bold text-[#F0F4F8] group-hover:text-violet-300 transition-colors">
                          {piece.title}
                        </h4>
                        <span className="text-xs font-mono text-slate-400">
                          {piece.composer}
                        </span>
                      </div>

                      {/* Maintenance Retention / Last Practiced Pill */}
                      <div className="flex items-center gap-1.5 text-[11px] font-mono">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span
                          className={
                            bucketKey === 'Maintenance'
                              ? piece.lastPracticedAtUtc
                                ? 'text-blue-400 font-medium'
                                : 'text-amber-400 font-medium'
                              : 'text-slate-400'
                          }
                        >
                          {bucketKey === 'Maintenance' && !piece.lastPracticedAtUtc
                            ? 'Retention pending'
                            : formatRelativeTime(piece.lastPracticedAtUtc)}
                        </span>
                      </div>

                      {/* Goals snippet if present */}
                      {piece.personalGoals && (
                        <p className="text-xs text-slate-400 line-clamp-2 italic border-l-2 border-violet-700/60 pl-2">
                          "{piece.personalGoals}"
                        </p>
                      )}

                      {/* Mini Pills: 3 Most Recent Practice Sessions */}
                      {piece.sessions.length > 0 && (
                        <div className="pt-2 border-t border-[#1E2638]/60 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 mr-1">
                            Recent:
                          </span>
                          {piece.sessions.map((session) => (
                            <span
                              key={session.id}
                              className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950/40 text-blue-300 border border-blue-800/40"
                              title={`${session.durationMinutes}m: ${session.targetSection || 'General practice'}`}
                            >
                              {session.durationMinutes}m
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-[#1E2638] rounded-xl">
                    No pieces in {config.title.toLowerCase()}.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Piece Modal */}
      <AddPieceModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={onCreatePiece}
      />
    </div>
  );
};
