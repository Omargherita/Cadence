import {
  CreatePieceRequest,
  CreatePracticeSessionRequest,
  CreateTaskRequest,
  PendingTake,
  Piece,
  PracticeSession,
  TaskItem,
  ToggleTaskRequest,
} from '../types/cadence';
import { db } from './db';
import { api } from './api';
import { syncEngine } from './syncEngine';
import { addDaysToIsoDate, getNextWeekdayIso, getTodayIsoDate } from '../utils/date';

/** Offline/optimistic read of tasks, ordered identically to the backend. */
async function readLocalTasks(date?: string): Promise<TaskItem[]> {
  let localTasks = await db.tasks.toArray();

  if (date) {
    localTasks = localTasks.filter((t) => t.scheduledDate === null || t.scheduledDate === date);
  }

  // Order identical to backend: IsCompleted asc, Priority asc, UpdatedAtUtc desc
  localTasks.sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) {
      return a.isCompleted ? 1 : -1;
    }
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return new Date(b.updatedAtUtc).getTime() - new Date(a.updatedAtUtc).getTime();
  });

  return localTasks;
}

/** Offline/optimistic read of pieces, ordered by bucket then most recently updated. */
async function readLocalPieces(): Promise<Piece[]> {
  const localPieces = await db.pieces.toArray();
  const bucketOrder: Record<string, number> = {
    MainChallenge: 0,
    Maintenance: 1,
    FutureExploration: 2,
  };

  localPieces.sort((a, b) => {
    const orderDiff = (bucketOrder[a.bucket] ?? 99) - (bucketOrder[b.bucket] ?? 99);
    if (orderDiff !== 0) return orderDiff;
    return new Date(b.updatedAtUtc).getTime() - new Date(a.updatedAtUtc).getTime();
  });

  return localPieces;
}

export const cadenceRepository = {
  /**
   * Fetches tasks with read-through cache support.
   *
   * The server response is authoritative for the slice it covers: cached rows in that slice that the
   * server no longer returns (deleted on another device, or an empty list) are removed so they can't
   * reappear as ghost tasks when offline. While mutations are queued, the local (optimistic) view is
   * returned instead so unsynced edits aren't hidden or overwritten.
   */
  async getTasks(date?: string): Promise<TaskItem[]> {
    if ((await syncEngine.getPendingMutationCount()) > 0) {
      return readLocalTasks(date);
    }

    let serverTasks: TaskItem[];
    try {
      serverTasks = await api.getTasks(date);
    } catch {
      // Offline fallback: read from local Dexie IndexedDB
      return readLocalTasks(date);
    }

    // A mutation may have been queued while the request was in flight; don't clobber it.
    if ((await syncEngine.getPendingMutationCount()) > 0) {
      return readLocalTasks(date);
    }

    await db.transaction('rw', db.tasks, async () => {
      const serverIds = new Set(serverTasks.map((t) => t.id));
      // The server only returned tasks matching `date` (or unscheduled), so only prune that slice.
      const staleIds = await db.tasks
        .filter(
          (t) =>
            !serverIds.has(t.id) &&
            (!date || t.scheduledDate === null || t.scheduledDate === date)
        )
        .primaryKeys();
      await db.tasks.bulkDelete(staleIds);
      await db.tasks.bulkPut(serverTasks);
    });
    return serverTasks;
  },

  /**
   * Creates a task with immediate optimistic local persistence and offline outbox queuing.
   */
  async createTask(req: CreateTaskRequest): Promise<TaskItem> {
    const id = req.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const localTask: TaskItem = {
      id,
      title: req.title,
      category: req.category,
      priority: req.priority ?? 2,
      recurrence: req.recurrence || 'None',
      scheduledDate: req.scheduledDate ?? null,
      isCompleted: false,
      completedAtUtc: null,
      updatedAtUtc: now,
    };

    // Optimistically write to Dexie
    await db.tasks.put(localTask);

    // If outbox is empty, attempt immediate sync
    const pendingCount = await syncEngine.getPendingCount();
    if (pendingCount === 0) {
      try {
        const createdOnServer = await api.createTask({ ...req, id });
        await db.tasks.put(createdOnServer);
        return createdOnServer;
      } catch {
        // Fall through to queueing in outbox
      }
    }

    // Queue mutation in outbox
    await db.syncOutbox.add({
      id: crypto.randomUUID(),
      timestampUtc: now,
      operationType: 'CREATE_TASK',
      endpoint: '/api/tasks',
      method: 'POST',
      payload: { ...req, id },
    });

    return localTask;
  },

  /**
   * Toggles task completion state with optimistic local updates.
   */
  async toggleTask(id: string): Promise<TaskItem> {
    const existing = await db.tasks.get(id);
    const now = new Date().toISOString();

    // Body for the server: the local calendar date plus the id of any occurrence we spawn below.
    const toggleReq: ToggleTaskRequest = { clientDate: getTodayIsoDate() };

    if (existing) {
      existing.isCompleted = !existing.isCompleted;
      existing.completedAtUtc = existing.isCompleted ? now : null;
      existing.updatedAtUtc = now;
      await db.tasks.put(existing);

      // If task was completed and is recurring, optimistically schedule next occurrence
      if (existing.isCompleted && existing.recurrence && existing.recurrence !== 'None') {
        const baseDate = existing.scheduledDate ?? getTodayIsoDate();
        let nextDateStr = baseDate;
        if (existing.recurrence === 'Daily') {
          nextDateStr = addDaysToIsoDate(baseDate, 1);
        } else if (existing.recurrence === 'Weekdays') {
          nextDateStr = getNextWeekdayIso(baseDate);
        } else if (existing.recurrence === 'Weekly') {
          nextDateStr = addDaysToIsoDate(baseDate, 7);
        }

        const alreadyExists = await db.tasks
          .filter((t) => t.title === existing.title && t.scheduledDate === nextDateStr && !t.isCompleted)
          .first();

        if (!alreadyExists) {
          const spawnedId = crypto.randomUUID();
          const spawnedTask: TaskItem = {
            id: spawnedId,
            title: existing.title,
            category: existing.category,
            priority: existing.priority,
            recurrence: existing.recurrence,
            scheduledDate: nextDateStr,
            isCompleted: false,
            completedAtUtc: null,
            updatedAtUtc: now,
          };
          await db.tasks.put(spawnedTask);
          // The server must create this exact row (same id) rather than a duplicate of its own.
          toggleReq.nextOccurrenceId = spawnedId;
        }
      }
    }

    const pendingCount = await syncEngine.getPendingCount();
    if (pendingCount === 0) {
      try {
        const updatedOnServer = await api.toggleTask(id, toggleReq);
        await db.tasks.put(updatedOnServer);
        return updatedOnServer;
      } catch {
        // Fall through to queueing
      }
    }

    await db.syncOutbox.add({
      id: crypto.randomUUID(),
      timestampUtc: now,
      operationType: 'TOGGLE_TASK',
      endpoint: `/api/tasks/${id}/toggle`,
      method: 'PATCH',
      payload: toggleReq,
    });

    if (existing) return existing;
    throw new Error(`Task ${id} not found`);
  },

  /**
   * Deletes a task locally and queues the deletion if offline.
   */
  async deleteTask(id: string): Promise<void> {
    await db.tasks.delete(id);

    const pendingCount = await syncEngine.getPendingCount();
    if (pendingCount === 0) {
      try {
        await api.deleteTask(id);
        return;
      } catch {
        // Fall through to queueing
      }
    }

    await db.syncOutbox.add({
      id: crypto.randomUUID(),
      timestampUtc: new Date().toISOString(),
      operationType: 'DELETE_TASK',
      endpoint: `/api/tasks/${id}`,
      method: 'DELETE',
    });
  },

  /**
   * Fetches pieces with read-through cache support.
   */
  async getPieces(): Promise<Piece[]> {
    // Queued mutations mean local rows hold optimistic state the server hasn't seen yet.
    if ((await syncEngine.getPendingMutationCount()) > 0) {
      return readLocalPieces();
    }

    let serverPieces: Piece[];
    try {
      serverPieces = await api.getPieces();
    } catch {
      // Offline fallback: read from Dexie
      return readLocalPieces();
    }

    // A mutation may have been queued while the request was in flight; don't clobber it.
    if ((await syncEngine.getPendingMutationCount()) > 0) {
      return readLocalPieces();
    }

    await db.transaction('rw', db.pieces, async () => {
      const serverIds = new Set(serverPieces.map((p) => p.id));
      const staleIds = await db.pieces.filter((p) => !serverIds.has(p.id)).primaryKeys();
      await db.pieces.bulkDelete(staleIds);
      await db.pieces.bulkPut(serverPieces);
    });
    return serverPieces;
  },

  /**
   * Creates a musical piece with optimistic local persistence.
   */
  async createPiece(req: CreatePieceRequest): Promise<Piece> {
    const id = req.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const localPiece: Piece = {
      id,
      title: req.title,
      composer: req.composer,
      bucket: req.bucket,
      personalGoals: req.personalGoals || '',
      interpretationNotes: req.interpretationNotes || '',
      scoreCapabilityTier: 'None',
      scoreFilePath: null,
      lastPracticedAtUtc: null,
      updatedAtUtc: now,
      sessions: [],
      weaknesses: [],
    };

    await db.pieces.put(localPiece);

    const pendingCount = await syncEngine.getPendingCount();
    if (pendingCount === 0) {
      try {
        const createdOnServer = await api.createPiece({ ...req, id });
        await db.pieces.put(createdOnServer);
        return createdOnServer;
      } catch {
        // Fall through to queueing
      }
    }

    await db.syncOutbox.add({
      id: crypto.randomUUID(),
      timestampUtc: now,
      operationType: 'CREATE_PIECE',
      endpoint: '/api/pieces',
      method: 'POST',
      payload: { ...req, id },
    });

    return localPiece;
  },

  /**
   * Logs a practice session locally and queues it for synchronization.
   */
  async logPracticeSession(
    pieceId: string,
    req: CreatePracticeSessionRequest
  ): Promise<PracticeSession> {
    const sessionId = req.id || crypto.randomUUID();
    const now = req.startedAtUtc || new Date().toISOString();

    const localSession: PracticeSession = {
      id: sessionId,
      pieceId,
      startedAtUtc: now,
      durationMinutes: req.durationMinutes,
      targetSection: req.targetSection || '',
      userSelfReflection: req.userSelfReflection || '',
      nextSessionGoal: req.nextSessionGoal || '',
    };

    // Update piece locally in Dexie
    const piece = await db.pieces.get(pieceId);
    if (piece) {
      piece.lastPracticedAtUtc = now;
      piece.updatedAtUtc = new Date().toISOString();
      piece.sessions = [localSession, ...(piece.sessions || [])];
      await db.pieces.put(piece);
    }

    const pendingCount = await syncEngine.getPendingCount();
    if (pendingCount === 0) {
      try {
        const createdOnServer = await api.logPracticeSession(pieceId, {
          ...req,
          id: sessionId,
          startedAtUtc: now,
        });
        return createdOnServer;
      } catch {
        // Fall through to queueing
      }
    }

    await db.syncOutbox.add({
      id: crypto.randomUUID(),
      timestampUtc: now,
      operationType: 'LOG_SESSION',
      endpoint: `/api/pieces/${pieceId}/sessions`,
      method: 'POST',
      payload: { ...req, id: sessionId, startedAtUtc: now },
    });

    return localSession;
  },

  /**
   * Queues an audio/video take offline in IndexedDB for later replay when backend is reachable.
   */
  async queueOfflineTake(pendingTake: PendingTake): Promise<void> {
    await db.pendingTakesOutbox.put(pendingTake);
  },

  /**
   * Retrieves pending offline takes, optionally filtered by pieceId or sessionId.
   */
  async getPendingTakes(pieceId?: string, sessionId?: string): Promise<PendingTake[]> {
    let takes = await db.pendingTakesOutbox.toArray();
    if (pieceId) {
      takes = takes.filter((t) => t.pieceId === pieceId);
    }
    if (sessionId) {
      takes = takes.filter((t) => t.sessionId === sessionId);
    }
    return takes.sort((a, b) => new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime());
  },

  /**
   * Removes a pending take from the outbox.
   */
  async deletePendingTake(id: string): Promise<void> {
    await db.pendingTakesOutbox.delete(id);
  },
};
