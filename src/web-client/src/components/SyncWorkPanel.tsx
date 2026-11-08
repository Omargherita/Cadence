import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { syncEngine } from '../services/syncEngine';
import { useModalFocus } from './useModalFocus';
type Work = Awaited<ReturnType<typeof syncEngine.listWork>>;
export type WorkEntry = Work['pending'][number];
function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SyncWorkEntry({ entry, busy, onRetry, onExport, onDiscard, onOpenSession }: {
    entry: WorkEntry;
    busy: boolean;
    onRetry: (state?: boolean) => void;
    onExport: (recording?: boolean) => void;
    onDiscard: () => void;
    onOpenSession: (pieceId: string, sessionId: string) => void;
}) {
    const legacyToggle = entry.kind === 'mutation' && (entry.item.operationType === 'TOGGLE_TASK' || entry.item.endpoint.endsWith('/toggle'));
    const [desired, setDesired] = useState('');
    const payload = entry.kind === 'take' ? {
        ...entry.item, mediaBlob: undefined
    } : entry.item;
    return <article className="sync-work-entry">
    <h3>{entry.title}</h3><p className={entry.failed ? 'attention' : 'secondary'}>{entry.reason}</p>
    {entry.kind === 'take' && <dl>
      <dt>Session date</dt><dd>{entry.sessionDate}</dd>
      <dt>Recording time</dt><dd>{entry.recordingTime}</dd>
      <dt>File</dt><dd>{entry.fileName}</dd><dt>Size</dt><dd>{entry.fileSize.toLocaleString()} bytes</dd>
      <dt>Session ID</dt><dd>{entry.sessionId}</dd>
    </dl>}
    {entry.item.nextAttemptAt && entry.item.nextAttemptAt > Date.now() ? <p className="secondary">Next attempt after {new Date(entry.item.nextAttemptAt).toLocaleString()}</p> : null}
    <details><summary>Inspect saved operation</summary><pre>{JSON.stringify(payload, null, 2)}</pre></details>
    {legacyToggle && <label>Choose the intended task state <select value={desired} onChange={e => setDesired(e.target.value)}><option value="">Choose…</option><option value="true">Completed</option><option value="false">Open</option></select></label>}
    <div className="sync-work-actions">
      <button disabled={busy || (legacyToggle && !desired)} onClick={() => onRetry(legacyToggle ? desired === 'true' : undefined)}>Retry{entry.kind === 'take' ? ' upload' : ''}</button>
      <button disabled={busy} onClick={() => onExport(false)}>Export details (JSON)</button>
      {entry.kind === 'take' && <button disabled={busy} onClick={() => onExport(true)}>Download recording</button>}
      {entry.kind === 'take' && <button onClick={() => onOpenSession(entry.pieceId, entry.sessionId)}>Open session</button>}
      <button disabled={busy} onClick={onDiscard}>Mark resolved / discard</button>
    </div>
  </article>;
}
export function SyncWorkPanel({ onClose, onOpenSession }: {
    onClose: () => void;
    onOpenSession: (pieceId: string, sessionId: string) => void;
}) {
    const [work, setWork] = useState<Work>({
        pending: [], failed: []
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const ref = useModalFocus(true, () => {
        if (!busy)
            onClose();
    });
    useEffect(() => syncEngine.subscribe(() => {
        void syncEngine.listWork().then(setWork).catch(e => setError(String(e)));
    }), []);
    async function action(fn: () => Promise<void>) {
        setBusy(true);
        setError('');
        try {
            await fn();
            setWork(await syncEngine.listWork());
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function exportEntry(entry: WorkEntry, recording = false) {
        const data = await syncEngine.exportWork(entry.kind, entry.id);
        // Each explicit action downloads one local file.
        if (!recording)
            download(new Blob([JSON.stringify(data.metadata, null, 2)], {
                type: 'application/json'
            }), `cadence-${entry.id}.json`);
        if (recording && data.recording)
            download(data.recording, data.fileName ?? `${entry.id}.bin`);
    }
    function discard(entry: WorkEntry) {
        const message = entry.kind === 'take' ? 'This recording will be deleted from this browser. Export it first if you need a copy. Mark resolved / discard?' : 'Remove this saved operation? Its local changes may be replaced by server state after sync. Export it first if needed.';
        if (window.confirm(message))
            void action(async () => {
                await syncEngine.discardWork(entry.kind, entry.id);
                await syncEngine.syncDown();
            });
    }
    return createPortal(<div className="sync-work-backdrop"><section ref={ref} className="record-dialog sync-work-panel" role="dialog" aria-modal="true" aria-label="Sync work">
    <div className="sync-work-actions"><h2>Sync work</h2><button disabled={busy} onClick={onClose}>Close</button></div>
    {syncEngine.pauseReason && <p role="status">{syncEngine.pauseReason}</p>}
    {error && <p role="alert" className="attention">{error}</p>}
    {(['failed', 'pending'] as const).map(group => <section key={group}><h3>{group === 'failed' ? 'Needs review / parked' : 'Pending / waiting'} ({work[group].length})</h3>
      {work[group].length === 0 && <p className="secondary">No {group === 'failed' ? 'work needs review' : 'pending work'}.</p>}
      {work[group].map(entry => <SyncWorkEntry key={`${entry.kind}:${entry.id}`} entry={entry} busy={busy} onRetry={state => void action(async () => {
                await syncEngine.retryWork(entry.kind, entry.id, state);
                await syncEngine.processOutbox();
            })} onExport={recording => void action(() => exportEntry(entry, recording))} onDiscard={() => discard(entry)} onOpenSession={(pieceId, sessionId) => {
                onOpenSession(pieceId, sessionId);
                onClose();
            }}/>)}
    </section>)}
  </section></div>, document.body);
}
