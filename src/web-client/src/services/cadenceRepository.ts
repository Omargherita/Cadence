import { CreatePieceRequest, CreatePracticeSessionRequest, CreateTaskRequest, PendingTake, Piece, TaskItem } from '../types/cadence';
import { db as defaultDb, CadenceLocalDb, OutboxItem, bumpRevision, mutationDependencies } from './db';
import { syncEngine as defaultEngine, SyncEngine } from './syncEngine';
import { addDaysToIsoDate, getNextWeekdayIso, getTodayIsoDate } from '../utils/date';
export function createCadenceRepository(db: CadenceLocalDb, engine: SyncEngine) {
    const tables = [db.tasks, db.pieces, db.syncOutbox, db.pendingTakesOutbox, db.syncMeta];
    async function enqueue(item: Omit<OutboxItem, 'id' | 'timestampUtc'>) {
        const sequence = await bumpRevision(db);
        await db.syncOutbox.add({
            ...item, sequence, dependencies: mutationDependencies(item), id: crypto.randomUUID(), timestampUtc: new Date().toISOString()
        });
    }
    return {
        async getTasks(date?: string) {
            await engine.syncDown();
            const tasks = await db.tasks.toArray();
            return tasks.filter(t => !date || t.scheduledDate === null || t.scheduledDate === date)
                .sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted) || a.priority - b.priority || b.updatedAtUtc.localeCompare(a.updatedAtUtc));
        },
        async getPieces() {
            await engine.syncDown();
            const order = {
                MainChallenge: 0, Maintenance: 1, FutureExploration: 2
            };
            return (await db.pieces.toArray()).sort((a, b) => order[a.bucket] - order[b.bucket] || b.updatedAtUtc.localeCompare(a.updatedAtUtc));
        },
        async createTask(req: CreateTaskRequest): Promise<TaskItem> {
            const id = req.id || crypto.randomUUID();
            const task: TaskItem = {
                id, title: req.title, category: req.category, priority: req.priority ?? 2,
                recurrence: req.recurrence ?? 'None', scheduledDate: req.scheduledDate ?? null,
                isCompleted: false, completedAtUtc: null, updatedAtUtc: new Date().toISOString(),
                seriesId: req.recurrence && req.recurrence !== 'None' ? id : null, occurrenceDate: req.scheduledDate ?? null
            };
            await db.transaction('rw', tables, async () => {
                await db.tasks.add(task);
                await enqueue({
                    operationType: 'CREATE_TASK', endpoint: '/api/tasks', method: 'POST', payload: {
                        ...req, id
                    }, resourceKey: `task:${id}`
                });
            });
            engine.triggerSync();
            await engine.refreshStatus();
            return task;
        },
        async toggleTask(id: string): Promise<TaskItem> {
            let result!: TaskItem;
            await db.transaction('rw', tables, async () => {
                const task = await db.tasks.get(id);
                if (!task)
                    throw new Error('Task not found');
                task.isCompleted = !task.isCompleted;
                task.completedAtUtc = task.isCompleted ? new Date().toISOString() : null;
                task.updatedAtUtc = new Date().toISOString();
                let nextId = task.nextOccurrenceId ?? undefined;
                if (task.isCompleted && task.recurrence && task.recurrence !== 'None' && task.nextOccurrenceId === undefined) {
                    const base = task.occurrenceDate ?? task.scheduledDate ?? getTodayIsoDate();
                    const date = task.recurrence === 'Weekdays' ? getNextWeekdayIso(base) : addDaysToIsoDate(base, task.recurrence === 'Weekly' ? 7 : 1);
                    const series = task.seriesId ?? task.id;
                    const existing = await db.tasks.filter(t => t.seriesId === series && t.occurrenceDate === date).first();
                    nextId = existing?.id ?? crypto.randomUUID();
                    if (!existing)
                        await db.tasks.add({
                            ...task, id: nextId, seriesId: series, occurrenceDate: date, scheduledDate: date, isCompleted: false, completedAtUtc: null, nextOccurrenceId: undefined
                        });
                    task.nextOccurrenceId = nextId;
                }
                await db.tasks.put(task);
                await enqueue({
                    operationType: 'SET_COMPLETED', endpoint: `/api/tasks/${id}/completion`, method: 'PATCH', payload: {
                        isCompleted: task.isCompleted, clientDate: getTodayIsoDate(), nextOccurrenceId: nextId
                    }, resourceKey: `task:${id}`
                });
                result = task;
            });
            engine.triggerSync();
            await engine.refreshStatus();
            return result;
        },
        async deleteTask(id: string) {
            await db.transaction('rw', tables, async () => {
                await db.tasks.delete(id);
                await enqueue({
                    operationType: 'DELETE_TASK', endpoint: `/api/tasks/${id}`, method: 'DELETE', resourceKey: `task:${id}`
                });
            });
            engine.triggerSync();
            await engine.refreshStatus();
        },
        async createPiece(req: CreatePieceRequest): Promise<Piece> {
            const id = req.id || crypto.randomUUID();
            const piece: Piece = {
                id, title: req.title, composer: req.composer, bucket: req.bucket, personalGoals: req.personalGoals ?? '', interpretationNotes: req.interpretationNotes ?? '', scoreCapabilityTier: 'None', scoreFilePath: null, lastPracticedAtUtc: null, updatedAtUtc: new Date().toISOString(), sessions: [], weaknesses: []
            };
            await db.transaction('rw', tables, async () => {
                await db.pieces.add(piece);
                await enqueue({
                    operationType: 'CREATE_PIECE', endpoint: '/api/pieces', method: 'POST', payload: {
                        ...req, id
                    }, resourceKey: `piece:${id}`
                });
            });
            engine.triggerSync();
            await engine.refreshStatus();
            return piece;
        },
        async logPracticeSession(pieceId: string, req: CreatePracticeSessionRequest) {
            const id = req.id || crypto.randomUUID();
            const startedAtUtc = req.startedAtUtc ?? new Date().toISOString();
            const session = {
                id, pieceId, startedAtUtc, durationMinutes: req.durationMinutes, targetSection: req.targetSection ?? '', userSelfReflection: req.userSelfReflection ?? '', nextSessionGoal: req.nextSessionGoal ?? ''
            };
            await db.transaction('rw', tables, async () => {
                const piece = await db.pieces.get(pieceId);
                if (!piece)
                    throw new Error('Piece not found');
                piece.sessions = [session, ...piece.sessions];
                piece.lastPracticedAtUtc = startedAtUtc;
                piece.updatedAtUtc = new Date().toISOString();
                await db.pieces.put(piece);
                await enqueue({
                    operationType: 'LOG_SESSION', endpoint: `/api/pieces/${pieceId}/sessions`, method: 'POST', payload: {
                        ...req, id, startedAtUtc
                    }, resourceKey: `session:${id}`
                });
            });
            engine.triggerSync();
            await engine.refreshStatus();
            return session;
        },
        async queueOfflineTake(take: PendingTake) {
            await db.transaction('rw', tables, async () => {
                const sequence = await bumpRevision(db);
                await db.pendingTakesOutbox.add({
                    ...take, sequence, dependencies: [`piece:${take.pieceId}`, `session:${take.sessionId}`]
                });
            });
            engine.triggerSync();
            await engine.refreshStatus();
        },
        async getPendingTakes(pieceId?: string, sessionId?: string) {
            return (await db.pendingTakesOutbox.toArray()).filter(t => (!pieceId || t.pieceId === pieceId) && (!sessionId || t.sessionId === sessionId)).sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
        },
        async deletePendingTake(id: string) {
            await db.transaction('rw', tables, async () => {
                await db.pendingTakesOutbox.delete(id);
                await bumpRevision(db);
            });
            engine.triggerSync();
            await engine.refreshStatus();
        },
    };
}
export const cadenceRepository = createCadenceRepository(defaultDb, defaultEngine);
