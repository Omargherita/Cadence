import Dexie, { type Table } from 'dexie';
import { PendingTake, Piece, TaskItem } from '../types/cadence';

export type MutationOperation =
  | 'CREATE_TASK'
  | 'TOGGLE_TASK'
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

  constructor() {
    super('CadenceLocalDb');
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
  }
}

export const db = new CadenceLocalDb();
