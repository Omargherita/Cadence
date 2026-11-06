import { StatusGlyph } from '../../components/StatusGlyph';
import { FC, useState } from 'react';
import {
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

  return <div className="repertoire-view">
    <section className="page-heading day-overview"><div><h1>Repertoire</h1><p>Your music, from first reading to lasting fluency.</p></div><div className="flex gap-2"><button className="icon-button" aria-label="Refresh repertoire" disabled={isLoading} onClick={onRefreshPieces}><RefreshCw size={16}/></button><button className="quiet-button" onClick={()=>setIsAddModalOpen(true)}><Plus size={16}/>Add piece</button></div></section>
    {isLoading && <p role="status" className="secondary">Loading repertoire…</p>}
    {buckets.map(bucket => <section className="repertoire-group" key={bucket}>
      <div className="section-heading"><StatusGlyph label={BUCKET_CONFIG[bucket].title} progress={bucket==='MainChallenge'?.5:bucket==='Maintenance'?1:0} tone={bucket==='Maintenance'?'blue':'violet'}/><h2>{BUCKET_CONFIG[bucket].title}</h2><span className="secondary">{pieces.filter(p=>p.bucket===bucket).length}</span></div>
      {pieces.filter(p=>p.bucket===bucket).map(piece=><button key={piece.id} className="piece-row" onClick={()=>onSelectPiece(piece.id)}>
        <div><h3>{piece.title}</h3><p>{piece.composer}</p>{piece.personalGoals&&<p className="piece-goal">{piece.personalGoals}</p>}</div>
        <div className="piece-metadata"><span>{piece.sessions.reduce((total,s)=>total+s.durationMinutes,0)}m recorded</span><span>{formatRelativeTime(piece.lastPracticedAtUtc)}</span></div>
      </button>)}
      {!pieces.some(p=>p.bucket===bucket)&&<p className="empty-line">{bucket==='MainChallenge'?'Add a piece you’re working on now.':bucket==='Maintenance'?'Keep familiar pieces here for regular practice.':'A place for music you want to explore.'}</p>}
    </section>)}
    <AddPieceModal isOpen={isAddModalOpen} onClose={()=>setIsAddModalOpen(false)} onSubmit={onCreatePiece}/>
  </div>;
};
