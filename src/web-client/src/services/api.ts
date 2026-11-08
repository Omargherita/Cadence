import {
  CreatePieceRequest,
  CreatePracticeSessionRequest,
  CreateTaskRequest,
  CreateWeaknessRequest,
  HealthStatus,
  Piece,
  PieceWeakness,
  PracticeSession,
  PracticeTake,
  TaskItem,
  ToggleTaskRequest,
  TaskCompletionResponse,
} from '../types/cadence';

const BASE_URL = typeof window !== 'undefined' ? '/api' : 'http://127.0.0.1:5006/api';

/** HTTP failure with its status code attached (network failures stay plain TypeErrors with no status). */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number, readonly retryAfterMs = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function buildApiError(res: Response, fallback: string): Promise<ApiError> {
  const body = await res.json().catch(() => ({}));
  const value=res.headers.get('Retry-After');
  const retryAfterMs=value ? (/^\d+$/.test(value.trim()) ? Number(value)*1000 : Math.max(0,Date.parse(value)-Date.now())) : 0;
  return new ApiError(body?.error || `${fallback}: ${res.statusText || res.status}`, res.status, Number.isFinite(retryAfterMs) ? retryAfterMs : 0);
}

/**
 * True when the host understood the request and rejected it for good (4xx other than 408/429).
 * Retrying such a request can never succeed, so it must not be queued/retried forever.
 */
export function isPermanentApiError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && ![401,403,408,409,429].includes(status);
}

export const api = {
  async getHealth(signal?:AbortSignal): Promise<HealthStatus> {
    const res = await fetch(`${BASE_URL}/health`,{signal});
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    return res.json();
  },

  async getTasks(date?: string, signal?:AbortSignal): Promise<TaskItem[]> {
    const url = date ? `${BASE_URL}/tasks?date=${encodeURIComponent(date)}` : `${BASE_URL}/tasks`;
    const res = await fetch(url,{signal});
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

  async toggleTask(id: string, req: ToggleTaskRequest): Promise<TaskCompletionResponse> {
    const res = await fetch(`${BASE_URL}/tasks/${id}/completion`, {
      method: 'PATCH',
      headers: req ? { 'Content-Type': 'application/json' } : undefined,
      body: req ? JSON.stringify(req) : undefined,
    });
    if (!res.ok) throw await buildApiError(res, 'Failed to toggle task');
    return res.json();
  },

  async deleteTask(id: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/tasks/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete task: ${res.statusText}`);
  },

  async getPieces(signal?:AbortSignal): Promise<Piece[]> {
    const res = await fetch(`${BASE_URL}/pieces`,{signal});
    if (!res.ok) throw new Error(`Failed to fetch pieces: ${res.statusText}`);
    return res.json();
  },

  async getPiece(id: string, signal?:AbortSignal): Promise<Piece> {
    const res = await fetch(`${BASE_URL}/pieces/${id}`,{signal});
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

  async uploadScore(pieceId: string, file: File): Promise<{ pieceId: string; scoreCapabilityTier: string; scoreFilePath: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}/pieces/${pieceId}/score`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to upload score: ${res.statusText}`);
    }
    return res.json();
  },

  getScoreUrl(pieceId: string): string {
    return `${BASE_URL}/pieces/${pieceId}/score`;
  },

  async addWeakness(pieceId: string, req: CreateWeaknessRequest): Promise<PieceWeakness> {
    const res = await fetch(`${BASE_URL}/pieces/${pieceId}/weaknesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to add weakness: ${res.statusText}`);
    }
    return res.json();
  },

  async getWeaknesses(pieceId: string): Promise<PieceWeakness[]> {
    const res = await fetch(`${BASE_URL}/pieces/${pieceId}/weaknesses`);
    if (!res.ok) throw new Error(`Failed to fetch weaknesses: ${res.statusText}`);
    return res.json();
  },

  async uploadTake(pieceId: string, sessionId: string, formData: FormData, signal?:AbortSignal): Promise<PracticeTake> {
    const res = await fetch(`${BASE_URL}/pieces/${pieceId}/sessions/${sessionId}/takes`, {
      method: 'POST',
      body: formData, signal,
    });
    if (!res.ok) throw await buildApiError(res, 'Failed to analyze take');
    return res.json();
  },

  async getTakes(pieceId: string, sessionId: string): Promise<PracticeTake[]> {
    const res = await fetch(`${BASE_URL}/pieces/${pieceId}/sessions/${sessionId}/takes`);
    if (!res.ok) throw new Error(`Failed to fetch takes: ${res.statusText}`);
    return res.json();
  },

  getMediaUrl(relativePath: string): string {
    const clean = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    return `${BASE_URL.replace(/\/api$/, '')}/api/media/${clean}`;
  },

  async triggerBackup(): Promise<{ backupPath: string; timestampUtc: string }> {
    const res = await fetch(`${BASE_URL}/system/backup`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Failed to trigger backup: ${res.statusText}`);
    return res.json();
  },
};
