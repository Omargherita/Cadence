import Dexie, { type Table } from 'dexie';
import { PendingTake, Piece, TaskItem } from '../types/cadence';

export type MutationOperation =
  | 'CREATE_TASK'
  | 'TOGGLE_TASK'
  | 'SET_COMPLETED'
  | 'DELETE_TASK'
  | 'CREATE_PIECE'
  | 'LOG_SESSION';

export interface OutboxItem {
  id: string;
  timestampUtc: string;
  operationType: MutationOperation;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  payload?: any;
  /** Number of server-side (5xx) failures so far; network outages are not counted. */
  attempts?: number;
  originalOperations?: Pick<OutboxItem, 'id' | 'timestampUtc' | 'operationType' | 'endpoint' | 'method' | 'payload'>[];
}

/** A mutation the host permanently rejected (or that exhausted its retry budget). */
export interface DeadLetterItem extends OutboxItem {
  failedAtUtc: string;
  failureReason: string;
  httpStatus: number | null;
}

export class CadenceLocalDb extends Dexie {
  tasks!: Table<TaskItem, string>;
  pieces!: Table<Piece, string>;
  syncOutbox!: Table<OutboxItem, string>;
  pendingTakesOutbox!: Table<PendingTake, string>;
  deadLetterOutbox!: Table<DeadLetterItem, string>;

  constructor(name = 'CadenceLocalDb') {
    super(name);
    this.version(1).stores({
      tasks: 'id, scheduledDate, isCompleted, priority, updatedAtUtc',
      pieces: 'id, bucket, lastPracticedAtUtc, updatedAtUtc',
      syncOutbox: 'id, timestampUtc, operationType',
    });

    this.version(2).stores({
      tasks: 'id, scheduledDate, isCompleted, priority, updatedAtUtc',
      pieces: 'id, bucket, lastPracticedAtUtc, updatedAtUtc',
      syncOutbox: 'id, timestampUtc, operationType',
      pendingTakesOutbox: 'id, pieceId, sessionId, createdAtUtc',
    });

    this.version(3).stores({
      tasks: 'id, scheduledDate, isCompleted, priority, updatedAtUtc',
      pieces: 'id, bucket, lastPracticedAtUtc, updatedAtUtc',
      syncOutbox: 'id, timestampUtc, operationType',
      pendingTakesOutbox: 'id, pieceId, sessionId, createdAtUtc',
      deadLetterOutbox: 'id, failedAtUtc',
    });
    this.version(4).stores({ syncOutbox: 'id,timestampUtc,operationType' }).upgrade(async tx => {
      const queued = await tx.table('syncOutbox').toArray() as OutboxItem[];
      const groups = new Map<string, OutboxItem[]>();
      for (const item of queued.filter(i => i.operationType === 'TOGGLE_TASK' || i.endpoint.endsWith('/toggle'))) {
        const id = item.endpoint.split('/')[3];
        groups.set(id, [...(groups.get(id) ?? []), item]);
      }
      for (const [id, items] of groups) {
        items.sort((a,b) => a.timestampUtc.localeCompare(b.timestampUtc) || a.id.localeCompare(b.id));
        const task = await tx.table('tasks').get(id) as TaskItem | undefined;
        const recurring = task?.recurrence && task.recurrence !== 'None';
        const clear = task && (!recurring || (items.length === 1 && task.isCompleted && items[0].payload?.nextOccurrenceId));
        await tx.table('syncOutbox').bulkDelete(items.map(i => i.id));
        const item = { ...items[items.length-1], originalOperations: items };
        if (clear) {
          await tx.table('syncOutbox').put({ ...item, operationType: 'SET_COMPLETED', endpoint: `/api/tasks/${id}/completion`, payload: { ...item.payload, isCompleted: task.isCompleted } });
        } else {
          await tx.table('deadLetterOutbox').put({ ...item, failedAtUtc: new Date().toISOString(), httpStatus: null,
            failureReason: 'This older queued toggle needs review: the saved task or recurring history does not tell us safely which completion to send.' });
        }
      }
      // Only rows present during this upgrade are legacy recordings. Never auto-send them.
      await tx.table('pendingTakesOutbox').toCollection().modify({ legacyReview: true,
        syncError: 'This recording may already have uploaded with the previous app version. Check the session before retrying.',
        syncFailedAtUtc: new Date().toISOString() });
      await tx.table('deadLetterOutbox').toCollection().modify((item: DeadLetterItem) => {
        if (item.operationType === 'TOGGLE_TASK' || item.endpoint.endsWith('/toggle')) {
          item.originalOperations ??= [{ ...item }];
          item.failureReason = 'This older queued toggle needs review before a desired completion state can be sent.';
        }
      });
    });

  }
}

export const db = new CadenceLocalDb();
