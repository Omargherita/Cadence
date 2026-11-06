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
    {open && <div role="dialog" aria-modal="true" aria-label="Edit record" className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl p-5 space-y-3 max-h-[90vh] overflow-auto w-full max-w-lg">
        {fields.map(field => <label key={field.key} className="block text-sm">{field.label}
          {field.options ? <select className="block w-full bg-slate-800 p-2" value={String(draft[field.key] ?? '')} onChange={e => setDraft({ ...draft, [field.key]: e.target.value })}>
            {field.options.map(option => <option key={option}>{option}</option>)}
          </select> : <input className="block w-full bg-slate-800 p-2" type={field.type ?? 'text'} value={String(draft[field.key] ?? '')}
            onChange={e => setDraft({ ...draft, [field.key]: field.type === 'number' ? Number(e.target.value) : field.type === 'date' ? e.target.value || null : e.target.value })} />}
        </label>)}
        {error && <p role="alert" className="text-red-300">{error}</p>}
        <button type="button" disabled={busy} onClick={() => save(false)} className="px-3 text-blue-300">Save</button>
        {allowDelete && <button type="button" disabled={busy} onClick={() => save(true)} className="px-3 text-red-300">Delete</button>}
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="px-3">Cancel</button>
      </div>
    </div>}
  </span>;
}
