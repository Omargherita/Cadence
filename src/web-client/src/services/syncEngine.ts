import { db as defaultDb, CadenceLocalDb, OutboxItem, bumpRevision, mutationDependencies, providedKey } from './db';
import { TaskCompletionResponse, PendingTake } from '../types/cadence';
import { api, buildApiError } from './api';

export interface SyncEngineStatus {
  isSyncing: boolean;
  pendingCount: number;
  /** Mutations/takes the host permanently rejected. They no longer block the queue. */
  failedCount: number;
  lastSyncedAtUtc: string | null;
  lastError: string | null;
}

/** How many server-side (5xx) failures an item may accumulate before it is parked. */
const MAX_SERVER_ERROR_ATTEMPTS = 5;

/**
 * - `retry`: the host is unreachable/overloaded (network error, 408/429/502/503/504). Stop and try later;
 *   this never counts against the item since nothing is wrong with the item itself.
 * - `server`: the host answered 5xx (e.g. 500). Retry a few times, then park the item.
 * - `permanent`: the host rejected the request (other 4xx). Retrying can never succeed.
 */
type FailureKind = 'retry' | 'server' | 'permanent';

function getHttpStatus(err: unknown): number | null {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}

function classifyFailure(err: unknown): FailureKind {
  const status = getHttpStatus(err);
  if (status === null) return 'retry'; // fetch() rejected: offline / DNS / connection refused
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) return 'retry';
  if (status >= 500) return 'server';
  if (status >= 400) return 'permanent';
  return 'retry';
}

export class SyncEngine {
  constructor(private readonly db: CadenceLocalDb = defaultDb) {}
  public async refreshStatus() { await this.notify(); }
  public async invalidateReads() { await this.db.transaction('rw', this.db.syncMeta, () => bumpRevision(this.db)); }
  public async hasProtectedWork() { return (await this.getPendingCount()) + (await this.getFailedCount()) > 0; }
  private isSyncing = false;
  private listeners: ((status: SyncEngineStatus) => void)[] = [];
  private lastSyncedAtUtc: string | null = null;
  private lastError: string | null = null;

  public subscribe(listener: (status: SyncEngineStatus) => void): () => void {
    this.listeners.push(listener);
    this.notify();
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private async notify() {
    const [pendingCount, failedCount] = await Promise.all([this.getPendingCount(), this.getFailedCount()]);

    const status: SyncEngineStatus = {
      isSyncing: this.isSyncing,
      pendingCount,
      failedCount,
      lastSyncedAtUtc: this.lastSyncedAtUtc,
      lastError: this.lastError,
    };
    for (const listener of this.listeners) {
      listener(status);
    }
  }

  /** Mutations still waiting to be replayed. Excludes dead-lettered items and parked takes. */
  public async getPendingMutationCount(): Promise<number> {
    return this.db.syncOutbox.count();
  }

  /** All work still waiting to sync (mutations + takes). Parked (rejected) takes are not "pending". */
  public async getPendingCount(): Promise<number> {
    const pendingMutations = await this.db.syncOutbox.count();
    const pendingTakes = await this.db.pendingTakesOutbox.filter((t) => !t.syncError).count();
    return pendingMutations + pendingTakes;
  }

  /** Items the host permanently rejected (dead-lettered mutations + parked takes). */
  public async getFailedCount(): Promise<number> {
    const deadLetters = await this.db.deadLetterOutbox.count();
    const parkedTakes = await this.db.pendingTakesOutbox.filter((t) => Boolean(t.syncError)).count();
    return deadLetters + parkedTakes;
  }

  /**
   * Replays pending mutations in FIFO order against the backend.
   */
  public async processOutbox(): Promise<{ processed: number; remaining: number }> {
    if (this.isSyncing) {
      return { processed: 0, remaining: await this.getPendingCount() };
    }

    try {
      this.isSyncing = true;
      this.lastError = null;
      await this.notify();

      // Check if backend is reachable before starting replay
      try {
        await api.getHealth();
      } catch {
        // Backend not reachable, abort replay quietly
        this.isSyncing = false;
        await this.notify();
        return { processed: 0, remaining: await this.getPendingCount() };
      }

      let processedCount = 0;
      const attempted = new Set<string>();
      // Re-read after each acknowledgement so newly satisfied dependencies can run in this cycle.
      for (;;) {
        const mutations = await this.db.syncOutbox.toArray();
        const takes = await this.db.pendingTakesOutbox.filter(t=>!t.syncError).toArray();
        const work = [...mutations.map(item=>({kind:'mutation' as const,item})),...takes.map(item=>({kind:'take' as const,item}))]
          .sort((a,b)=>(a.item.sequence ?? 0)-(b.item.sequence ?? 0)||a.item.id.localeCompare(b.item.id));
        let progressed = false;
        for (const entry of work) {
          const item=entry.item;
          if (attempted.has(item.id)) continue;
          const dependencies=item.dependencies ?? (entry.kind==='mutation' ? mutationDependencies(entry.item) : [`piece:${entry.item.pieceId}`,`session:${entry.item.sessionId}`]);
          if (!await this.dependenciesReady(dependencies, entry.kind==='take' ? entry.item.pieceId : undefined)) continue;
          if (entry.kind==='mutation') {
            const resource=entry.item.resourceKey ?? entry.item.endpoint;
            const failed=await this.db.deadLetterOutbox.toArray();
            if ([...mutations,...failed].some(other=>other.id!==item.id && (other.resourceKey ?? other.endpoint)===resource && (other.sequence ?? 0)<(item.sequence ?? 0))) continue;
          }
          attempted.add(item.id);
          try {
            if(entry.kind==='mutation') {
              await this.executeMutation(entry.item);
              await this.db.transaction('rw',this.db.syncOutbox,this.db.syncMeta,async()=>{
                const key=providedKey(entry.item);
                // A completion acknowledges only the canonical successor returned by the server.
                if(key && entry.item.operationType!=='SET_COMPLETED') await this.db.syncMeta.put({key:`ack:${key}`,value:1});
                await this.db.syncOutbox.delete(item.id);await bumpRevision(this.db);
              });
            } else {
              await api.uploadTake(entry.item.pieceId,entry.item.sessionId,this.takeForm(entry.item));
              await this.db.transaction('rw',this.db.pendingTakesOutbox,this.db.syncMeta,async()=>{await this.db.pendingTakesOutbox.delete(item.id);await bumpRevision(this.db);});
            }
            processedCount++;progressed=true;
          } catch (error) {
            const message=error instanceof Error ? error.message : 'Sync failed';
            this.lastError=message;
            const kind=classifyFailure(error);
            const attempts=(item.attempts ?? 0)+1;
            if(kind==='retry') continue;
            if(kind==='server' && attempts<MAX_SERVER_ERROR_ATTEMPTS) {
              if(entry.kind==='mutation') await this.db.syncOutbox.update(item.id,{attempts});
              else await this.db.pendingTakesOutbox.update(item.id,{attempts});
              continue;
            }
            if(entry.kind==='mutation') await this.deadLetter(entry.item,message,getHttpStatus(error));
            else await this.db.pendingTakesOutbox.update(item.id,{syncError:message,syncFailedAtUtc:new Date().toISOString()});
          }
        }
        if(!progressed) break;
      }

      if (processedCount > 0) {
        this.lastSyncedAtUtc = new Date().toISOString();
        // Refresh local read caches from server (a no-op while mutations are still queued)
        await this.syncDown();
      }

      return {
        processed: processedCount,
        remaining: await this.getPendingCount(),
      };
    } finally {
      this.isSyncing = false;
      await this.notify();
    }
  }

  private takeForm(take: PendingTake): FormData {
    const form=new FormData();form.append('id',take.id);
    form.append('file',new File([take.mediaBlob],take.originalFileName,{type:take.mimeType}));
    form.append('scope',take.scope);form.append('targetSection',take.targetSection);
    form.append('userSelfReflection',take.userSelfReflection);form.append('attachedPdfPages',take.attachedPdfPages);
    form.append('includeVideoPostureAnalysis',String(take.includeVideoPostureAnalysis));form.append('sourceQuality','PhoneMicCompressed');
    return form;
  }

  private async dependenciesReady(keys: string[], pieceId?: string): Promise<boolean> {
    for(const key of keys) {
      if((await this.db.syncMeta.get(`ack:${key}`))?.value===1) continue;
      const providers=[...await this.db.syncOutbox.toArray(),...await this.db.deadLetterOutbox.toArray()];
      if(providers.some(item=>providedKey(item)===key)) return false;
      const [kind,id]=key.split(':');
      try {
        let found=false;
        if(kind==='task') found=(await api.getTasks()).some(task=>task.id===id);
        if(kind==='piece') found=(await api.getPiece(id)).id===id;
        if(kind==='session' && pieceId) found=(await api.getPiece(pieceId)).sessions.some(session=>session.id===id);
        if(!found) return false;
        await this.db.syncMeta.put({key:`ack:${key}`,value:1});
      } catch { return false; }
    }
    return true;
  }

  private async deadLetter(item: OutboxItem, reason: string, httpStatus: number | null): Promise<void> {
    await this.db.transaction('rw', this.db.syncOutbox, this.db.deadLetterOutbox, async () => {
      await this.db.deadLetterOutbox.put({
        ...item,
        failedAtUtc: new Date().toISOString(),
        failureReason: reason,
        httpStatus,
      });
      await this.db.syncOutbox.delete(item.id);
    });
  }

  public async applyCompletion(id: string, proposedId: string | undefined, response: TaskCompletionResponse) {
    await this.db.transaction('rw', this.db.tasks, this.db.syncOutbox, this.db.syncMeta, async () => {
      const next = response.nextOccurrence;
      if (proposedId && proposedId !== next?.id) {
        const dependent = await this.db.syncOutbox.filter(i => i.endpoint.includes(`/${proposedId}/`) || i.endpoint.endsWith(`/${proposedId}`)).toArray();
        if (next) for (const item of dependent) await this.db.syncOutbox.update(item.id, { endpoint: item.endpoint.replace(proposedId, next.id), resourceKey:`task:${next.id}`, dependencies:(item.dependencies ?? []).map(key=>key===`task:${proposedId}` ? `task:${next.id}` : key) });
        if (!dependent.length || next) await this.db.tasks.delete(proposedId);
      }
      const queued = await this.db.syncOutbox.toArray();
      // Keep the latest local desired state when an older completion reply arrives.
      const taskOps = queued.filter(i => i.endpoint === `/api/tasks/${id}/completion` || (i.method === 'DELETE' && i.endpoint === `/api/tasks/${id}`));
      if (taskOps.length <= 1) await this.db.tasks.put({ ...response.task, id, nextOccurrenceId: next?.id ?? null });
      if (next && !queued.some(i => i.endpoint.includes(`/${next.id}`))) await this.db.tasks.put(next);
      await this.db.syncMeta.put({key:`ack:task:${id}`,value:1});
      if(next) await this.db.syncMeta.put({key:`ack:task:${next.id}`,value:1});
      await bumpRevision(this.db);
    });
  }

  private async executeMutation(item: OutboxItem): Promise<void> {
    if (item.operationType === 'TOGGLE_TASK' || item.endpoint.endsWith('/toggle')) throw Object.assign(new Error('Legacy toggle requires review'), { status: 409 });
    const url = typeof window !== 'undefined' ? item.endpoint : `http://127.0.0.1:5006${item.endpoint}`;
    const res = await fetch(url, {
      method: item.method,
      headers: item.payload ? { 'Content-Type': 'application/json' } : undefined,
      body: item.payload ? JSON.stringify(item.payload) : undefined,
    });

    // 2xx or 404 on delete is considered resolved
    if (!res.ok && !(res.status === 404 && item.method === 'DELETE')) {
      throw await buildApiError(res, 'HTTP ' + res.status);
    }
    if (item.operationType === 'SET_COMPLETED') await this.applyCompletion(item.endpoint.split('/')[3], item.payload?.nextOccurrenceId, await res.json());
  }

  /**
   * Refreshes local Dexie tables from the backend API.
   *
   * Only replaces the local cache when nothing is queued: with queued mutations the local rows hold
   * optimistic state the server hasn't seen yet, and wiping them would make queued creates/toggles
   * vanish from the UI until they replay.
   */
  public async syncDown(): Promise<void> {
    const revision = (await this.db.syncMeta.get('revision'))?.value ?? 0;
    try {
      const [tasks,pieces] = await Promise.all([api.getTasks(),api.getPieces()]);
      await this.db.transaction('rw', [this.db.tasks,this.db.pieces,this.db.syncOutbox,this.db.deadLetterOutbox,this.db.pendingTakesOutbox,this.db.syncMeta], async()=>{
        if (revision !== ((await this.db.syncMeta.get('revision'))?.value ?? 0) || await this.hasProtectedWork()) return;
        await this.db.tasks.clear();await this.db.tasks.bulkPut(tasks);
        await this.db.pieces.clear();await this.db.pieces.bulkPut(pieces);
      });
      this.lastSyncedAtUtc=new Date().toISOString();await this.notify();
    } catch { /* Keep the offline cache. */ }
  }

}

export const syncEngine = new SyncEngine();
