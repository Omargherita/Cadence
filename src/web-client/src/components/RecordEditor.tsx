import { createPortal } from 'react-dom';
import { useModalFocus } from './useModalFocus';
import { useState } from 'react';
import { db } from '../services/db';
import { syncEngine } from '../services/syncEngine';
import { buildApiError } from '../services/api';

type Field = { key: string; label: string; type?: 'number' | 'date'; options?: string[] };
export function RecordEditor({ endpoint, value, fields, onSaved, allowDelete = true }: {
  endpoint: string; value: object; fields: Field[]; onSaved: (deleted: boolean) => Promise<void>;
  allowDelete?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useModalFocus(open, () => { if (!busy) setOpen(false); });
  async function save(deleted: boolean) {
    if (deleted && !window.confirm('Delete this record and its associated records?')) return;
    setBusy(true); setError('');
    try {
      if (await syncEngine.getPendingCount()) throw new Error('Wait for pending changes to sync before editing or deleting.');
      const res = await fetch(endpoint, { method: deleted ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' }, body: deleted ? undefined : JSON.stringify(draft) });
      if (!res.ok) throw await buildApiError(res, 'Could not save changes');
      if (endpoint.startsWith('/api/tasks/')) {
        if (deleted) await db.tasks.delete((value as { id: string }).id);
        else await db.tasks.put(await res.json());
      } else {
        const id = endpoint.split('/')[3];
        if (deleted && endpoint === `/api/pieces/${id}`) {
          await db.pieces.delete(id);
          await db.pendingTakesOutbox.where('pieceId').equals(id).delete();
        } else {
          const refreshed = await fetch(`/api/pieces/${id}`);
          if (refreshed.ok) await db.pieces.put(await refreshed.json());
        }
      }
      await onSaved(deleted); setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save changes'); }
    finally { setBusy(false); }
  }
  return <span onClick={e => e.stopPropagation()}>
    <button type="button" className="text-xs text-blue-300 px-2" onClick={() => { setDraft({ ...value }); setOpen(true); }}>Edit</button>
    {open && createPortal(<div onClick={e => { if(e.target === e.currentTarget && !busy) setOpen(false); }} role="dialog" aria-modal="true" aria-label="Edit record" className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div ref={dialogRef} className="record-dialog bg-[#111622] rounded-lg p-5 space-y-3 max-h-[90vh] overflow-auto w-full max-w-lg">
        <h2 className="text-lg font-medium">Edit record</h2>
        {fields.map(field => <label key={field.key} className="block text-sm">{field.label}
          {field.options ? <select className="block w-full bg-[#0B0E14] border border-[#1E2638] rounded-md p-2.5 mt-2" value={String(draft[field.key] ?? '')} onChange={e => setDraft({ ...draft, [field.key]: e.target.value })}>
            {field.options.map(option => <option key={option}>{option.replace(/([a-z])([A-Z])/g, '$1 $2')}</option>)}
          </select> : <input className="block w-full bg-[#0B0E14] border border-[#1E2638] rounded-md p-2.5 mt-2" type={field.type ?? 'text'} value={String(draft[field.key] ?? '')}
            onChange={e => setDraft({ ...draft, [field.key]: field.type === 'number' ? Number(e.target.value) : field.type === 'date' ? e.target.value || null : e.target.value })} />}
        </label>)}
        {error && <p role="alert" className="text-red-300">{error}</p>}
        <button type="button" disabled={busy} onClick={() => save(false)} className="px-3 text-blue-300">Save changes</button>
        {allowDelete && <button type="button" disabled={busy} onClick={() => save(true)} className="px-3 text-red-300">Delete</button>}
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="px-3">Cancel</button>
      </div>
    </div>, document.body)}
  </span>;
}
