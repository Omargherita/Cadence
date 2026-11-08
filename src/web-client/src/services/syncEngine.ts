import { db as defaultDb, CadenceLocalDb, OutboxItem, bumpRevision, mutationDependencies, mutationResource, providedKey } from './db';
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
    const status = (err as {
        status?: unknown;
    } | null)?.status;
    return typeof status === 'number' ? status : null;
}
function classifyFailure(err: unknown): FailureKind {
    const status = getHttpStatus(err);
    if (status === null)
        return 'retry'; // fetch() rejected: offline / DNS / connection refused
    if (status === 401 || status === 403 || status === 408 || status === 429 || status === 502 || status === 503 || status === 504)
        return 'retry';
    if (status >= 500)
        return 'server';
    if (status >= 400)
        return 'permanent';
    return 'retry';
}
export interface SyncLockManager {
    request<T>(name: string, options: {
        ifAvailable: true;
    }, callback: (lock: object | null) => Promise<T>): Promise<T>;
}
export const OUTBOX_LOCK = 'cadence-outbox';
export const LOCKS_UNAVAILABLE = "Sync is paused: Web Locks is unavailable. Tabs need HTTPS or localhost to coordinate; Tailscale Serve provides HTTPS.";
export class SyncEngine {
    private readonly locks: SyncLockManager | null;
    private readonly timeoutMs: number;
    private signal?: AbortSignal;
    constructor(private readonly db: CadenceLocalDb = defaultDb, options: {
        locks?: SyncLockManager | null;
        timeoutMs?: number;
    } = {}) {
        this.locks = options.locks === undefined ? (typeof navigator !== 'undefined' ? navigator.locks ?? null : null) : options.locks;
        this.timeoutMs = options.timeoutMs ?? 300000;
    }
    public get pauseReason() {
        return this.locks ? null : LOCKS_UNAVAILABLE;
    }
    public async runOnlineEdit(action: (signal: AbortSignal) => Promise<void>): Promise<void> {
        if (this.activeDrain)
            await this.activeDrain;
        if (!this.locks)
            throw new Error(LOCKS_UNAVAILABLE);
        await this.locks.request(OUTBOX_LOCK, {
            ifAvailable: true
        }, async (lock) => {
            if (!lock)
                throw new Error('Another tab is syncing. Try again shortly.');
            if (await this.hasProtectedWork())
                throw new Error('Resolve queued and failed work before editing or deleting.');
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                await action(controller.signal);
            }
            finally {
                clearTimeout(timer);
                controller.abort();
                await this.invalidateReads();
            }
        });
    }
    private activeDrain?: Promise<{
        processed: number;
        remaining: number;
    }>;
    private rescan = false;
    public processOutbox(signal?: AbortSignal): Promise<{
        processed: number;
        remaining: number;
    }> {
        if (this.activeDrain) {
            this.rescan = true;
            return this.activeDrain;
        }
        this.activeDrain = (async () => {
            let processed = 0;
            let remaining = 0;
            do {
                this.rescan = false;
                const result = await this.processPass(signal);
                processed += result.processed;
                remaining = result.remaining;
            } while (this.rescan && !signal?.aborted);
            return {
                processed, remaining
            };
        })().finally(() => {
            this.activeDrain = undefined;
        });
        return this.activeDrain;
    }
    public triggerSync() {
        void this.processOutbox().catch(async (error) => {
            this.lastError = String(error);
            await this.notify();
        });
    }
    private async processPass(signal?: AbortSignal): Promise<{
        processed: number;
        remaining: number;
    }> {
        const skipped = async () => ({
            processed: 0, remaining: await this.getPendingCount()
        });
        if (this.isSyncing)
            return skipped();
        this.isSyncing = true;
        try {
            if (!this.locks) {
                this.lastError = LOCKS_UNAVAILABLE;
                return await skipped();
            }
            return await this.locks.request(OUTBOX_LOCK, {
                ifAvailable: true
            }, async (lock) => {
                if (!lock || signal?.aborted)
                    return skipped();
                const controller = new AbortController();
                const abort = () => controller.abort();
                signal?.addEventListener('abort', abort, {
                    once: true
                });
                const timer = setTimeout(abort, this.timeoutMs);
                this.signal = controller.signal;
                // No queue snapshot exists before this point. Drain reads IndexedDB under ownership.
                try {
                    return await this.drainOutbox();
                }
                finally {
                    clearTimeout(timer);
                    signal?.removeEventListener('abort', abort);
                    controller.abort();
                    this.signal = undefined;
                }
                // Web Locks releases ownership when this callback settles, including thrown errors.
            });
        }
        finally {
            this.isSyncing = false;
            await this.notify();
        }
    }
    public async refreshStatus() {
        await this.notify();
    }
    public async invalidateReads() {
        await this.db.transaction('rw', this.db.syncMeta, () => bumpRevision(this.db));
    }
    public async hasProtectedWork() {
        return (await this.getPendingCount()) + (await this.getFailedCount()) > 0;
    }
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
            lastError: this.pauseReason ?? this.lastError,
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
    private async drainOutbox(): Promise<{
        processed: number;
        remaining: number;
    }> {
        try {
            this.lastError = null;
            await this.notify();
            // Check if backend is reachable before starting replay
            try {
                await api.getHealth(this.signal);
            }
            catch {
                // Backend not reachable, abort replay quietly
                await this.notify();
                return {
                    processed: 0, remaining: await this.getPendingCount()
                };
            }
            let processedCount = 0;
            const attempted = new Set<string>();
            // Re-read after each acknowledgement so newly satisfied dependencies can run in this cycle.
            for (;;) {
                if (this.signal?.aborted)
                    break;
                const mutations = await this.db.syncOutbox.toArray();
                const takes = await this.db.pendingTakesOutbox.filter(t => !t.syncError).toArray();
                const work = [...mutations.map(item => ({
                        kind: 'mutation' as const, item
                    })), ...takes.map(item => ({
                        kind: 'take' as const, item
                    }))]
                    .sort((a, b) => (a.item.sequence ?? 0) - (b.item.sequence ?? 0) || a.item.id.localeCompare(b.item.id));
                let progressed = false;
                for (const entry of work) {
                    if (this.signal?.aborted)
                        break;
                    const item = entry.item;
                    if (entry.kind === 'mutation' ? !await this.db.syncOutbox.get(item.id) : (await this.db.pendingTakesOutbox.get(item.id))?.syncError)
                        continue;
                    if (attempted.has(item.id) || (item.nextAttemptAt ?? 0) > Date.now())
                        continue;
                    const dependencies = item.dependencies ?? (entry.kind === 'mutation' ? mutationDependencies(entry.item) : [`piece:${entry.item.pieceId}`, `session:${entry.item.sessionId}`]);
                    if (entry.kind === 'mutation') {
                        const resource = mutationResource(entry.item);
                        const failed = await this.db.deadLetterOutbox.toArray();
                        if ([...mutations, ...failed].some(other => other.id !== item.id && mutationResource(other) === resource && (other.sequence ?? 0) < (item.sequence ?? 0)))
                            continue;
                    }
                    try {
                        if (!await this.dependenciesReady(dependencies, entry.kind === 'take' ? entry.item.pieceId : undefined))
                            continue;
                        attempted.add(item.id);
                        if (entry.kind === 'mutation') {
                            await this.executeMutation(entry.item);
                            await this.db.transaction('rw', this.db.syncOutbox, this.db.syncMeta, async () => {
                                const key = providedKey(entry.item);
                                // A completion acknowledges only the canonical successor returned by the server.
                                if (key && entry.item.operationType !== 'SET_COMPLETED')
                                    await this.db.syncMeta.put({
                                        key: `ack:${key}`, value: 1
                                    });
                                await this.db.syncOutbox.delete(item.id);
                                await bumpRevision(this.db);
                            });
                        }
                        else {
                            await api.uploadTake(entry.item.pieceId, entry.item.sessionId, this.takeForm(entry.item), this.signal);
                            await this.db.transaction('rw', this.db.pendingTakesOutbox, this.db.syncMeta, async () => {
                                await this.db.pendingTakesOutbox.delete(item.id);
                                await bumpRevision(this.db);
                            });
                        }
                        processedCount++;
                        progressed = true;
                    }
                    catch (error) {
                        attempted.add(item.id);
                        const message = error instanceof Error ? error.message : 'Sync failed';
                        this.lastError = message;
                        const kind = classifyFailure(error);
                        const attempts = (item.attempts ?? 0) + 1;
                        if (kind === 'retry' || (kind === 'server' && attempts < MAX_SERVER_ERROR_ATTEMPTS)) {
                            const retryCount = (item.retryCount ?? 0) + 1;
                            const retryAfter = (error as {
                                retryAfterMs?: number;
                            })?.retryAfterMs ?? 0;
                            const delay = Math.max(retryAfter, Math.min(300000, 1000 * 2 ** Math.min(retryCount, 8)));
                            const update = {
                                nextAttemptAt: Date.now() + delay, retryCount, lastError: message, lastHttpStatus: getHttpStatus(error), ...(kind === 'server' ? {
                                    attempts
                                } : {})
                            };
                            if (entry.kind === 'mutation')
                                await this.db.syncOutbox.update(item.id, update);
                            else
                                await this.db.pendingTakesOutbox.update(item.id, update);
                            continue;
                        }
                        if (entry.kind === 'mutation')
                            await this.deadLetter(entry.item, getHttpStatus(error) === 409 ? `Conflict: ${message}. Compare server state before retrying; your local intent is retained.` : message, getHttpStatus(error));
                        else
                            await this.db.pendingTakesOutbox.update(item.id, {
                                syncError: getHttpStatus(error) === 409 ? `Conflict: ${message}. Check the session before retrying.` : message, lastHttpStatus: getHttpStatus(error), syncFailedAtUtc: new Date().toISOString()
                            });
                    }
                }
                if (!progressed)
                    break;
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
        }
        finally {
            await this.notify();
        }
    }
    public async listWork() {
        const [queued, failed, takes, pieces, tasks] = await Promise.all([this.db.syncOutbox.toArray(), this.db.deadLetterOutbox.toArray(), this.db.pendingTakesOutbox.toArray(), this.db.pieces.toArray(), this.db.tasks.toArray()]);
        const mutations = [...queued, ...failed].map(item => ({
            kind: 'mutation' as const, id: item.id, title: tasks.find(t => `task:${t.id}` === item.resourceKey)?.title ?? pieces.find(p => `piece:${p.id}` === item.resourceKey)?.title ?? item.operationType,
            reason: 'failureReason' in item ? String(item.failureReason) : item.lastError ?? (item.dependencies?.length ? 'Waiting to sync after parent acknowledgement.' : 'Waiting to sync.'),
            failed: 'failureReason' in item, item,
        }));
        const recordings = takes.map(item => {
            const piece = pieces.find(p => p.id === item.pieceId);
            const session = piece?.sessions.find(s => s.id === item.sessionId);
            return {
                kind: 'take' as const, id: item.id, title: piece?.title ?? `Piece ${item.pieceId}`, reason: item.syncError ?? item.lastError ?? 'Waiting for parent acknowledgement and upload.', failed: Boolean(item.syncError), item,
                pieceId: item.pieceId, sessionId: item.sessionId, sessionDate: session?.startedAtUtc ?? 'Unknown session date', recordingTime: item.createdAtUtc, fileName: item.originalFileName, fileSize: item.mediaBlob.size
            };
        });
        const all = [...mutations, ...recordings];
        return {
            pending: all.filter(i => !i.failed), failed: all.filter(i => i.failed)
        };
    }
    public async exportWork(kind: 'take' | 'mutation', id: string): Promise<{
        metadata: Record<string, any>;
        recording?: Blob;
        fileName?: string;
    }> {
        if (kind === 'take') {
            const take = await this.db.pendingTakesOutbox.get(id);
            if (!take)
                throw new Error('Recording not found');
            const { mediaBlob, ...metadata } = take;
            const piece = await this.db.pieces.get(take.pieceId);
            return {
                metadata: {
                    ...metadata, pieceName: piece?.title, sessionDate: piece?.sessions.find(s => s.id === take.sessionId)?.startedAtUtc, fileSize: mediaBlob.size
                }, recording: mediaBlob, fileName: take.originalFileName
            };
        }
        const item = await this.db.deadLetterOutbox.get(id) ?? await this.db.syncOutbox.get(id);
        if (!item)
            throw new Error('Operation not found');
        return {
            metadata: item
        };
    }
    public async retryWork(kind: 'take' | 'mutation', id: string, desiredState?: boolean) {
        await this.db.transaction('rw', [this.db.tasks, this.db.syncOutbox, this.db.deadLetterOutbox, this.db.pendingTakesOutbox, this.db.syncMeta], async () => {
            if (kind === 'take') {
                const take = await this.db.pendingTakesOutbox.get(id);
                if (!take)
                    return;
                await this.db.pendingTakesOutbox.update(id, {
                    syncError: null, syncFailedAtUtc: null, legacyReview: false, attempts: 0, retryCount: 0, lastError: undefined, nextAttemptAt: take.lastHttpStatus === 429 ? take.nextAttemptAt : 0
                });
            }
            else {
                const failed = await this.db.deadLetterOutbox.get(id);
                const item = failed ?? await this.db.syncOutbox.get(id);
                if (!item)
                    return;
                if (item.operationType === 'TOGGLE_TASK' || item.endpoint.endsWith('/toggle')) {
                    if (desiredState === undefined)
                        throw new Error('Choose the completed state before retrying this legacy operation.');
                    item.operationType = 'SET_COMPLETED';
                    item.endpoint = item.endpoint.replace(/\/toggle$/, '/completion');
                    item.payload = {
                        isCompleted: desiredState, clientDate: item.payload?.clientDate
                    };
                    item.dependencies = [`task:${item.endpoint.split('/')[3]}`];
                    await this.db.tasks.update(item.endpoint.split('/')[3], {
                        isCompleted: desiredState
                    });
                }
                const { failureReason: _reason, failedAtUtc: _time, httpStatus: _status, ...queued } = item as typeof item & {
                    failureReason?: string;
                    failedAtUtc?: string;
                    httpStatus?: number | null;
                };
                await this.db.syncOutbox.put({
                    ...queued, attempts: 0, retryCount: 0, lastError: undefined, nextAttemptAt: item.lastHttpStatus === 429 ? item.nextAttemptAt : 0
                });
                await this.db.deadLetterOutbox.delete(id);
            }
            await bumpRevision(this.db);
        });
        await this.notify();
    }
    public async discardWork(kind: 'take' | 'mutation', id: string) {
        // Caller requires explicit confirmation; this is never part of automatic recovery.
        await this.db.transaction('rw', [this.db.syncOutbox, this.db.deadLetterOutbox, this.db.pendingTakesOutbox, this.db.syncMeta], async () => {
            if (kind === 'take')
                await this.db.pendingTakesOutbox.delete(id);
            else {
                const parent = await this.db.syncOutbox.get(id) ?? await this.db.deadLetterOutbox.get(id);
                const key = parent && providedKey(parent);
                if (key)
                    await this.parkChildren(key);
                await this.db.syncOutbox.delete(id);
                await this.db.deadLetterOutbox.delete(id);
            }
            await bumpRevision(this.db);
        });
        await this.notify();
    }
    private async parkChildren(key: string): Promise<void> {
        await this.db.transaction('rw', [this.db.syncOutbox, this.db.deadLetterOutbox, this.db.pendingTakesOutbox, this.db.syncMeta], async () => {
            await this.db.syncMeta.delete(`ack:${key}`);
            const reason = 'Needs review: the parent was discarded or the server confirmed it is missing. Your data is retained; export or discard it.';
            for (const item of await this.db.syncOutbox.toArray()) {
                if (!(item.dependencies ?? mutationDependencies(item)).includes(key))
                    continue;
                await this.deadLetter(item, reason, 404);
                const child = providedKey(item);
                if (child)
                    await this.parkChildren(child);
            }
            for (const take of await this.db.pendingTakesOutbox.toArray()) {
                if ((take.dependencies ?? [`piece:${take.pieceId}`, `session:${take.sessionId}`]).includes(key))
                    await this.db.pendingTakesOutbox.update(take.id, {
                        syncError: reason, syncFailedAtUtc: new Date().toISOString()
                    });
            }
            await bumpRevision(this.db);
        });
    }
    private takeForm(take: PendingTake): FormData {
        const form = new FormData();
        form.append('id', take.id);
        form.append('file', new File([take.mediaBlob], take.originalFileName, {
            type: take.mimeType
        }));
        form.append('scope', take.scope);
        form.append('targetSection', take.targetSection);
        form.append('userSelfReflection', take.userSelfReflection);
        form.append('attachedPdfPages', take.attachedPdfPages);
        form.append('includeVideoPostureAnalysis', String(take.includeVideoPostureAnalysis));
        form.append('sourceQuality', 'PhoneMicCompressed');
        return form;
    }
    private async ackServerRows(tasks: {
        id: string;
    }[], pieces: {
        id: string;
        sessions: {
            id: string;
        }[];
    }[]) {
        const keys = [...tasks.map(t => `task:${t.id}`), ...pieces.flatMap(p => [`piece:${p.id}`, ...(p.sessions ?? []).map(s => `session:${s.id}`)])];
        await this.db.syncMeta.bulkPut(keys.map(key => ({
            key: `ack:${key}`, value: 1
        })));
    }
    private async dependenciesReady(keys: string[], pieceId?: string): Promise<boolean> {
        for (const key of keys) {
            if ((await this.db.syncMeta.get(`ack:${key}`))?.value === 1)
                continue;
            const providers = [...await this.db.syncOutbox.toArray(), ...await this.db.deadLetterOutbox.toArray()];
            if (providers.some(item => providedKey(item) === key))
                return false;
            const [kind, id] = key.split(':');
            try {
                let found = false;
                if (kind === 'task') {
                    const tasks = await api.getTasks(undefined, this.signal);
                    await this.ackServerRows(tasks, []);
                    found = tasks.some(task => task.id === id);
                }
                if (kind === 'piece') {
                    const piece = await api.getPiece(id, this.signal);
                    await this.ackServerRows([], [piece]);
                    found = piece.id === id;
                }
                if (kind === 'session' && pieceId) {
                    let piece;
                    try {
                        piece = await api.getPiece(pieceId, this.signal);
                    }
                    catch (error) {
                        if (getHttpStatus(error) === 404) {
                            await this.parkChildren(`piece:${pieceId}`);
                            return false;
                        }
                        throw error;
                    }
                    await this.ackServerRows([], [piece]);
                    found = piece.sessions.some(session => session.id === id);
                }
                if (!found)
                    return false;
                await this.db.syncMeta.put({
                    key: `ack:${key}`, value: 1
                });
            }
            catch (error) {
                if (getHttpStatus(error) === 404 && kind === 'task')
                    throw new Error('Task list unavailable; cannot confirm this task is missing.');
                if (getHttpStatus(error) === 404 && kind !== 'task') {
                    await this.parkChildren(key);
                    return false;
                }
                throw error;
            }
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
        await this.db.transaction('rw', [this.db.tasks, this.db.syncOutbox, this.db.deadLetterOutbox, this.db.syncMeta], async () => {
            const next = response.nextOccurrence;
            const localParent = await this.db.tasks.get(id);
            let nextHasLocalIntent = false;
            // Reopen responses have no successor body; they do not mean the successor was deleted.
            if (response.task.isCompleted && proposedId && proposedId !== next?.id) {
                const localNext = await this.db.tasks.get(proposedId);
                const queued = await this.db.syncOutbox.toArray();
                const failed = await this.db.deadLetterOutbox.toArray();
                const dependents = [...queued, ...failed].filter(i => i.endpoint.includes(`/${proposedId}/`) || i.endpoint.endsWith(`/${proposedId}`));
                for (const item of dependents) {
                    if (next) {
                        const table = failed.some(f => f.id === item.id) ? this.db.deadLetterOutbox : this.db.syncOutbox;
                        await table.update(item.id, {
                            endpoint: item.endpoint.replace(proposedId, next.id), resourceKey: `task:${next.id}`, dependencies: (item.dependencies ?? []).map(key => key === `task:${proposedId}` ? `task:${next.id}` : key)
                        });
                    }
                    else {
                        await this.db.deadLetterOutbox.put({
                            ...item, failedAtUtc: new Date().toISOString(), httpStatus: 409, failureReason: 'The server successor was deleted. This local occurrence and its intended changes are retained for review.'
                        });
                        await this.db.syncOutbox.delete(item.id);
                    }
                }
                if (next && localNext && dependents.length) {
                    await this.db.tasks.put({
                        ...localNext, id: next.id, seriesId: next.seriesId, occurrenceDate: next.occurrenceDate
                    });
                    nextHasLocalIntent = true;
                }
                if (next || !dependents.length)
                    await this.db.tasks.delete(proposedId);
            }
            const queued = [...await this.db.syncOutbox.toArray(), ...await this.db.deadLetterOutbox.toArray()];
            const taskOps = queued.filter(i => i.endpoint === `/api/tasks/${id}/completion` || (i.method === 'DELETE' && i.endpoint === `/api/tasks/${id}`));
            const marker = response.task.isCompleted ? next?.id ?? null : localParent?.nextOccurrenceId;
            if (taskOps.length <= 1)
                await this.db.tasks.put({
                    ...response.task, id, nextOccurrenceId: marker
                });
            else if (localParent)
                await this.db.tasks.update(id, {
                    nextOccurrenceId: marker
                });
            if (next && !nextHasLocalIntent && !queued.some(i => i.endpoint.includes(`/${next.id}`)))
                await this.db.tasks.put(next);
            await this.db.syncMeta.put({
                key: `ack:task:${id}`, value: 1
            });
            if (next)
                await this.db.syncMeta.put({
                    key: `ack:task:${next.id}`, value: 1
                });
            await bumpRevision(this.db);
        });
    }
    private async executeMutation(item: OutboxItem): Promise<void> {
        if (item.operationType === 'TOGGLE_TASK' || item.endpoint.endsWith('/toggle'))
            throw Object.assign(new Error('Legacy toggle requires review'), {
                status: 409
            });
        const url = typeof window !== 'undefined' ? item.endpoint : `http://127.0.0.1:5006${item.endpoint}`;
        const res = await fetch(url, {
            method: item.method,
            signal: this.signal,
            headers: item.payload ? {
                'Content-Type': 'application/json'
            } : undefined,
            body: item.payload ? JSON.stringify(item.payload) : undefined,
        });
        // 2xx or 404 on delete is considered resolved
        if (!res.ok && !(res.status === 404 && item.method === 'DELETE')) {
            throw await buildApiError(res, 'HTTP ' + res.status);
        }
        if (item.operationType === 'SET_COMPLETED')
            await this.applyCompletion(item.endpoint.split('/')[3], item.payload?.nextOccurrenceId, await res.json());
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
            const [tasks, pieces] = await Promise.all([api.getTasks(undefined, this.signal), api.getPieces(this.signal)]);
            await this.db.transaction('rw', [this.db.tasks, this.db.pieces, this.db.syncOutbox, this.db.deadLetterOutbox, this.db.pendingTakesOutbox, this.db.syncMeta], async () => {
                if (revision !== ((await this.db.syncMeta.get('revision'))?.value ?? 0) || await this.hasProtectedWork())
                    return;
                await this.db.tasks.clear();
                await this.db.tasks.bulkPut(tasks);
                await this.db.pieces.clear();
                await this.db.pieces.bulkPut(pieces);
                await this.ackServerRows(tasks, pieces);
            });
            this.lastSyncedAtUtc = new Date().toISOString();
            await this.notify();
        }
        catch { /* Keep the offline cache. */
        }
    }
}
export const syncEngine = new SyncEngine();
