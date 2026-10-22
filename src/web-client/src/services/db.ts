import Dexie, { type Table } from 'dexie';
import { Piece, TaskItem } from '../types/cadence';

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
}

export class CadenceLocalDb extends Dexie {
  tasks!: Table<TaskItem, string>;
  pieces!: Table<Piece, string>;
  syncOutbox!: Table<OutboxItem, string>;

  constructor() {
    super('CadenceLocalDb');
    this.version(1).stores({
      tasks: 'id, scheduledDate, isCompleted, priority, updatedAtUtc',
      pieces: 'id, bucket, lastPracticedAtUtc, updatedAtUtc',
      syncOutbox: 'id, timestampUtc, operationType',
    });
  }
}

export const db = new CadenceLocalDb();
