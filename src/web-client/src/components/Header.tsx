import { useModalFocus } from './useModalFocus';
import { useState } from 'react';
import { CalendarDays, CalendarRange, Inbox, CheckCheck, Library, Menu, X, RefreshCw, Database } from 'lucide-react';
import { api } from '../services/api';
import { DAY_ARCHETYPES, DayArchetype, Piece } from '../types/cadence';
export type Horizon = 'today' | 'weekly' | 'unscheduled' | 'completed' | 'all';
interface HeaderProps {
  activeView: 'organizer' | 'library'; onSelectView: (view: 'organizer' | 'library') => void;
  failedOutboxCount: number; onReviewSync: () => void;
  isOnline: boolean; pendingOutboxCount: number; isSyncing: boolean; onSyncNow: () => Promise<void>;
  horizon: Horizon; onHorizon: (horizon: Horizon) => void; pieces: Piece[]; onPiece: (id: string) => void;
  selectedPieceId: string | null; archetype: DayArchetype; onArchetype: (value: DayArchetype) => void;
}
export function Header(p: HeaderProps) {
  const [open, setOpen] = useState(false);
  const drawerRef = useModalFocus<HTMLElement>(open, () => setOpen(false));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = (action: () => void) => { action(); setOpen(false); };
  async function backup() { setBusy(true); try { const result = await api.triggerBackup(); setMessage(`Backup saved: ${result.backupPath.split('/').pop()}`); } catch { setMessage('Backup failed. Check the host connection and try again.'); } finally { setBusy(false); } }
  const practiced = p.pieces.flatMap(piece => piece.sessions).filter(session => new Date(session.startedAtUtc).toDateString() === new Date().toDateString()).reduce((total,session) => total + session.durationMinutes,0);
  const target = parseInt(DAY_ARCHETYPES.find(a => a.type === p.archetype)?.pianoTarget || '30',10) || 30;
  const items = [['today', 'Today', CalendarDays], ['weekly', 'Weekly', CalendarRange], ['unscheduled', 'Unscheduled', Inbox], ['completed', 'Logbook', CheckCheck], ['all', 'All tasks', Inbox]] as const;
  return <>
    {open && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside ref={drawerRef} className={`app-sidebar ${open ? 'is-open' : ''}`} aria-label="Main navigation">
      <div className="wordmark"><span className="cadence-mark" aria-hidden="true">Ⅱ</span> Cadence <button className="mobile-only icon-button" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={18}/></button></div>
      <nav><p className="nav-section">Organizer</p>
        {items.map(([key,label,Icon]) => <button key={key} aria-current={p.activeView === 'organizer' && p.horizon === key ? 'page' : undefined} onClick={() => navigate(() => { p.onHorizon(key); p.onSelectView('organizer'); })}><Icon size={16}/>{label}</button>)}
        <p className="nav-section">Studio</p>
        <button aria-current={p.activeView === 'library' && !p.selectedPieceId ? 'page' : undefined} onClick={() => navigate(() => p.onSelectView('library'))}><Library size={16}/>All repertoire</button>
        <p className="nav-section">Main challenge</p>
        {p.pieces.filter(piece => piece.bucket === 'MainChallenge').map(piece => <button key={piece.id} aria-current={p.activeView === 'library' && p.selectedPieceId === piece.id ? 'page' : undefined} onClick={() => navigate(() => p.onPiece(piece.id))}><span className="status-ring violet"/ ><span className="truncate">{piece.title}</span></button>)}
        {!p.pieces.some(piece => piece.bucket === 'MainChallenge') && <p className="nav-empty">Your focus pieces will appear here.</p>}
      </nav>
      <footer className="sidebar-footer"><label htmlFor="day-structure">Day structure</label><select id="day-structure" value={p.archetype} onChange={e => p.onArchetype(e.target.value as DayArchetype)}>{DAY_ARCHETYPES.map(a => <option key={a.type} value={a.type}>{a.label}</option>)}</select>
        <p className="secondary">{DAY_ARCHETYPES.find(a => a.type === p.archetype)?.pianoTarget}</p>
        <p className="secondary">{practiced}m practiced today</p><progress className="practice-progress" aria-label="Daily practice target" value={practiced} max={target}/><div className="system-row"><span className={p.isOnline ? 'secondary' : 'attention'}>{p.isOnline ? '● Connected' : '○ Offline'}</span><button disabled={busy || !p.isOnline} onClick={backup} title="Create database backup"><Database size={14}/>{busy ? 'Saving…' : 'Backup'}</button></div>
        {p.pendingOutboxCount > 0 && <button disabled={!p.isOnline || p.isSyncing} onClick={p.onSyncNow}><RefreshCw size={14}/>{p.isSyncing ? 'Syncing…' : `${p.pendingOutboxCount} queued · Sync now`}</button>}
        {(p.pendingOutboxCount > 0 || p.failedOutboxCount > 0) && <button onClick={p.onReviewSync}>{p.failedOutboxCount} need review · {p.pendingOutboxCount} pending · Inspect sync work</button>}
        <p role="status" className="system-message">{message}</p>
      </footer>
    </aside>
    <header className="context-bar"><button className="mobile-only icon-button" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={18}/></button><span>{p.activeView === 'organizer' ? 'Organizer' : 'Repertoire'}</span><span className="secondary">/</span><span className="truncate">{p.activeView === 'organizer' ? items.find(i => i[0] === p.horizon)?.[1] : p.pieces.find(piece => piece.id === p.selectedPieceId)?.title || 'All pieces'}</span></header>
  </>;
}
