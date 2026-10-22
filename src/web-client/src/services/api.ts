import {
  CreatePieceRequest,
  CreatePracticeSessionRequest,
  CreateTaskRequest,
  HealthStatus,
  Piece,
  PracticeSession,
  TaskItem,
} from '../types/cadence';

const BASE_URL = typeof window !== 'undefined' ? '/api' : 'http://127.0.0.1:5006/api';

export const api = {
  async getHealth(): Promise<HealthStatus> {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    return res.json();
  },

  async getTasks(date?: string): Promise<TaskItem[]> {
    const url = date ? `${BASE_URL}/tasks?date=${encodeURIComponent(date)}` : `${BASE_URL}/tasks`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.statusText}`);
    return res.json();
  },

  async createTask(req: CreateTaskRequest): Promise<TaskItem> {
    const res = await fetch(`${BASE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to create task: ${res.statusText}`);
    }
    return res.json();
  },

  async toggleTask(id: string): Promise<TaskItem> {
    const res = await fetch(`${BASE_URL}/tasks/${id}/toggle`, {
      method: 'PATCH',
    });
    if (!res.ok) throw new Error(`Failed to toggle task: ${res.statusText}`);
    return res.json();
  },

  async deleteTask(id: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/tasks/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete task: ${res.statusText}`);
  },

  async getPieces(): Promise<Piece[]> {
    const res = await fetch(`${BASE_URL}/pieces`);
    if (!res.ok) throw new Error(`Failed to fetch pieces: ${res.statusText}`);
    return res.json();
  },

  async getPiece(id: string): Promise<Piece> {
    const res = await fetch(`${BASE_URL}/pieces/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch piece: ${res.statusText}`);
    return res.json();
  },

  async createPiece(req: CreatePieceRequest): Promise<Piece> {
    const res = await fetch(`${BASE_URL}/pieces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to create piece: ${res.statusText}`);
    }
    return res.json();
  },

  async logPracticeSession(
    pieceId: string,
    req: CreatePracticeSessionRequest
  ): Promise<PracticeSession> {
    const res = await fetch(`${BASE_URL}/pieces/${pieceId}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to log practice session: ${res.statusText}`);
    }
    return res.json();
  },

  async triggerBackup(): Promise<{ backupPath: string; timestampUtc: string }> {
    const res = await fetch(`${BASE_URL}/system/backup`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Failed to trigger backup: ${res.statusText}`);
    return res.json();
  },
};
