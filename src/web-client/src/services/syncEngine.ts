import { db as defaultDb, CadenceLocalDb, OutboxItem, bumpRevision } from './db';
import { TaskCompletionResponse } from '../types/cadence';
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

      const items = await this.db.syncOutbox.orderBy('timestampUtc').toArray();
      let processedCount = 0;

      for (const item of items) {
        try {
          await this.executeMutation(item);
          await this.db.transaction('rw', this.db.syncOutbox, this.db.syncMeta, async()=> { await this.db.syncOutbox.delete(item.id); await bumpRevision(this.db); });
          processedCount++;
          await this.notify();
        } catch (err: any) {
          console.warn(`Failed to replay mutation ${item.id} (${item.operationType}):`, err);
          const message = err?.message || 'Sync failed';
          const kind = classifyFailure(err);

          if (kind === 'retry') {
            // Transient outage: stop here so FIFO order is preserved and retry on the next tick.
            this.lastError = message;
            break;
          }

          if (kind === 'server') {
            const attempts = (item.attempts ?? 0) + 1;
            if (attempts < MAX_SERVER_ERROR_ATTEMPTS) {
              await this.db.syncOutbox.update(item.id, { attempts });
              this.lastError = message;
              break;
            }
          }

          // Permanent rejection (or retry budget exhausted): park it so it can't wedge the queue,
          // then keep going so later, independent mutations still sync.
          await this.deadLetter(item, message, getHttpStatus(err));
          this.lastError = `Discarded ${item.operationType}: ${message}`;
          await this.notify();
        }
      }

      // Replay pending offline practice takes (skipping ones the host already rejected)
      const pendingTakes = await this.db.pendingTakesOutbox
        .orderBy('createdAtUtc')
        .filter((t) => !t.syncError)
        .toArray();
      for (const take of pendingTakes) {
        try {
          const formData = new FormData();
          const file = new File([take.mediaBlob], take.originalFileName, { type: take.mimeType });
          formData.append('file', file);
          formData.append('id', take.id);
          formData.append('scope', take.scope);
          formData.append('targetSection', take.targetSection);
          formData.append('userSelfReflection', take.userSelfReflection);
          formData.append('attachedPdfPages', take.attachedPdfPages);
          formData.append('includeVideoPostureAnalysis', take.includeVideoPostureAnalysis ? 'true' : 'false');
          formData.append('sourceQuality', 'PhoneMicCompressed');

          await api.uploadTake(take.pieceId, take.sessionId, formData);
          await this.db.transaction('rw', this.db.pendingTakesOutbox, this.db.syncMeta, async()=> { await this.db.pendingTakesOutbox.delete(take.id); await bumpRevision(this.db); });
          processedCount++;
          await this.notify();
        } catch (takeErr: any) {
          console.warn(`Failed to replay pending take ${take.id}:`, takeErr);
          const message = takeErr?.message || 'Take sync failed';
          const kind = classifyFailure(takeErr);

          if (kind === 'retry') {
            this.lastError = message;
            break;
          }

          if (kind === 'server') {
            const attempts = (take.attempts ?? 0) + 1;
            if (attempts < MAX_SERVER_ERROR_ATTEMPTS) {
              await this.db.pendingTakesOutbox.update(take.id, { attempts });
              this.lastError = message;
              break;
            }
          }

          // Never delete the user's recording: keep the blob, mark it as rejected and move on.
          await this.db.pendingTakesOutbox.update(take.id, {
            syncError: message,
            syncFailedAtUtc: new Date().toISOString(),
          });
          this.lastError = `Take rejected by host: ${message}`;
          await this.notify();
        }
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
        if (next) for (const item of dependent) await this.db.syncOutbox.update(item.id, { endpoint: item.endpoint.replace(proposedId, next.id) });
        if (!dependent.length || next) await this.db.tasks.delete(proposedId);
      }
      const queued = await this.db.syncOutbox.toArray();
      // Keep the latest local desired state when an older completion reply arrives.
      const taskOps = queued.filter(i => i.endpoint === `/api/tasks/${id}/completion` || (i.method === 'DELETE' && i.endpoint === `/api/tasks/${id}`));
      if (taskOps.length <= 1) await this.db.tasks.put({ ...response.task, id, nextOccurrenceId: next?.id ?? null });
      if (next && !queued.some(i => i.endpoint.includes(`/${next.id}`))) await this.db.tasks.put(next);
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
