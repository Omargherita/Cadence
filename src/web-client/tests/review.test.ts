import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { db } from '../src/services/db';
import { cadenceRepository as repo } from '../src/services/cadenceRepository';
import { syncEngine } from '../src/services/syncEngine';
beforeEach(async () => { await db.open(); vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); })); });
afterEach(async () => { await syncEngine.processOutbox(); vi.unstubAllGlobals(); await db.delete(); });
test('five rapid creates sync in order once without awaiting the network', async () => {
 const sent: string[] = []; let release!: () => void; const gate = new Promise<void>(r => release = r);
 vi.stubGlobal('fetch', vi.fn(async (_url, init) => { if (init?.method === 'POST') { await gate; sent.push(JSON.parse(String(init.body)).id); } return Response.json([]); }));
 await Promise.all(Array.from({length:5}, (_,i) => repo.createTask({id:`task-${i}`,title:'Practice',category:'Piano'})));
 await new Promise(r=>setTimeout(r,20)); const active = syncEngine['isSyncing'];
 release(); expect(active).toBe(true); await syncEngine.processOutbox(); expect(sent).toEqual(['task-0','task-1','task-2','task-3','task-4']);
});
