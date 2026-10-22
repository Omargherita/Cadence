import { db, OutboxItem } from './db';
import { api } from './api';

export interface SyncEngineStatus {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAtUtc: string | null;
  lastError: string | null;
}

export class SyncEngine {
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
    const pendingCount = await db.syncOutbox.count();
    const status: SyncEngineStatus = {
      isSyncing: this.isSyncing,
      pendingCount,
      lastSyncedAtUtc: this.lastSyncedAtUtc,
      lastError: this.lastError,
    };
    for (const listener of this.listeners) {
      listener(status);
    }
  }

  public async getPendingCount(): Promise<number> {
    return db.syncOutbox.count();
  }

  /**
   * Replays pending mutations in FIFO order against the backend.
   */
  public async processOutbox(): Promise<{ processed: number; remaining: number }> {
    if (this.isSyncing) {
      return { processed: 0, remaining: await db.syncOutbox.count() };
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
        return { processed: 0, remaining: await db.syncOutbox.count() };
      }

      const items = await db.syncOutbox.orderBy('timestampUtc').toArray();
      let processedCount = 0;

      for (const item of items) {
        try {
          await this.executeMutation(item);
          await db.syncOutbox.delete(item.id);
          processedCount++;
          await this.notify();
        } catch (err: any) {
          console.warn(`Failed to replay mutation ${item.id} (${item.operationType}):`, err);
          this.lastError = err?.message || 'Sync failed';
          // Stop queue execution on network failure so order is preserved
          break;
        }
      }

      if (processedCount > 0) {
        this.lastSyncedAtUtc = new Date().toISOString();
        // Refresh local read caches from server
        await this.syncDown();
      }

      return {
        processed: processedCount,
        remaining: await db.syncOutbox.count(),
      };
    } finally {
      this.isSyncing = false;
      await this.notify();
    }
  }

  private async executeMutation(item: OutboxItem): Promise<void> {
    const url = typeof window !== 'undefined' ? item.endpoint : `http://127.0.0.1:5006${item.endpoint}`;
    const res = await fetch(url, {
      method: item.method,
      headers: item.payload ? { 'Content-Type': 'application/json' } : undefined,
      body: item.payload ? JSON.stringify(item.payload) : undefined,
    });

    // 2xx or 404 on delete is considered resolved
    if (!res.ok && !(res.status === 404 && item.method === 'DELETE')) {
      const errorJson = await res.json().catch(() => ({}));
      throw new Error(errorJson.error || `HTTP ${res.status}: ${res.statusText}`);
    }
  }

  /**
   * Refreshes local Dexie tables from the backend API.
   */
  public async syncDown(): Promise<void> {
    try {
      const [tasks, pieces] = await Promise.all([
        api.getTasks(),
        api.getPieces(),
      ]);

      await db.transaction('rw', db.tasks, db.pieces, async () => {
        await db.tasks.clear();
        await db.tasks.bulkPut(tasks);

        await db.pieces.clear();
        await db.pieces.bulkPut(pieces);
      });

      this.lastSyncedAtUtc = new Date().toISOString();
      await this.notify();
    } catch (err) {
      console.warn('Sync down failed, keeping local offline cache', err);
    }
  }
}

export const syncEngine = new SyncEngine();
