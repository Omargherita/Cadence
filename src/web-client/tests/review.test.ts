import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { db } from '../src/services/db';
import { cadenceRepository as repo } from '../src/services/cadenceRepository';
import { syncEngine } from '../src/services/syncEngine';
beforeEach(async () => {
    await db.open();
    vi.stubGlobal('fetch', vi.fn(async () => {
        throw new TypeError('offline');
    }));
});
afterEach(async () => {
    await syncEngine.processOutbox();
    vi.unstubAllGlobals();
    await db.delete();
});
test('five rapid creates sync in order once without awaiting the network', async () => {
    const sent: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(r => release = r);
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
        if (init?.method === 'POST') {
            await gate;
            sent.push(JSON.parse(String(init.body)).id);
        }
        return Response.json([]);
    }));
    await Promise.all(Array.from({
        length: 5
    }, (_, i) => repo.createTask({
        id: `task-${i}`, title: 'Practice', category: 'Piano'
    })));
    await new Promise(r => setTimeout(r, 20));
    const active = syncEngine['isSyncing'];
    release();
    expect(active).toBe(true);
    await syncEngine.processOutbox();
    expect(sent).toEqual(['task-0', 'task-1', 'task-2', 'task-3', 'task-4']);
});
test('legacy piece resource keys do not let failed session A block session B', async () => {
    const base = {
        timestampUtc: '2026', operationType: 'LOG_SESSION' as const, endpoint: '/api/pieces/p/sessions', method: 'POST' as const, resourceKey: 'piece:p', dependencies: ['piece:p']
    };
    await db.syncMeta.put({
        key: 'ack:piece:p', value: 1
    });
    await db.deadLetterOutbox.put({
        ...base, id: 'a', sequence: 1, payload: {
            id: 'a'
        }, failedAtUtc: '2026', failureReason: 'invalid', httpStatus: 400
    });
    await db.syncOutbox.put({
        ...base, id: 'b', sequence: 2, payload: {
            id: 'b'
        }
    });
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
        if (init?.method === 'POST')
            sent.push(JSON.parse(String(init.body)).id);
        return Response.json([]);
    }));
    await syncEngine.processOutbox();
    expect(sent).toEqual(['b']);
});
async function orphanFixture() {
    await db.syncOutbox.bulkPut([
        {
            id: 'parent', timestampUtc: '2026', operationType: 'CREATE_PIECE', endpoint: '/api/pieces', method: 'POST', payload: {
                id: 'p'
            }
        },
        {
            id: 'child', timestampUtc: '2026', operationType: 'LOG_SESSION', endpoint: '/api/pieces/p/sessions', method: 'POST', payload: {
                id: 's'
            }, dependencies: ['piece:p']
        },
    ]);
    await db.pendingTakesOutbox.put({
        id: 'take', pieceId: 'p', sessionId: 's', scope: 'PassageClip', targetSection: '', userSelfReflection: '', attachedPdfPages: '', includeVideoPostureAnalysis: false, mediaBlob: new Blob(['retained']), originalFileName: 'test.wav', mimeType: 'audio/wav', createdAtUtc: '2026', dependencies: ['piece:p', 'session:s']
    });
}
test('discarding a parent parks descendants and retains exportable data', async () => {
    await orphanFixture();
    await syncEngine.discardWork('mutation', 'parent');
    expect((await syncEngine.listWork()).failed).toHaveLength(2);
    expect(await (await syncEngine.exportWork('take', 'take')).recording!.text()).toBe('retained');
    expect(await db.syncOutbox.count()).toBe(0);
});
test.each([404, 500, 'timeout'])('dependency response %s only cascades on explicit 404', async (status) => {
    await orphanFixture();
    await db.syncOutbox.delete('parent');
    vi.stubGlobal('fetch', vi.fn(async (url) => {
        if (String(url).endsWith('/health'))
            return Response.json({});
        if (status === 'timeout')
            throw new TypeError('timeout');
        return Response.json({}, {
            status: Number(status)
        });
    }));
    await syncEngine.processOutbox();
    expect((await syncEngine.listWork()).failed.length).toBe(status === 404 ? 2 : 0);
});
test('pieces sort by update time within their bucket', async () => {
    await repo.createPiece({
        id: 'old', title: 'Old', composer: 'C', bucket: 'MainChallenge'
    });
    await repo.createPiece({
        id: 'new', title: 'New', composer: 'C', bucket: 'MainChallenge'
    });
    await db.pieces.update('old', {
        updatedAtUtc: '2020', lastPracticedAtUtc: '2030'
    });
    await db.pieces.update('new', {
        updatedAtUtc: '2026', lastPracticedAtUtc: null
    });
    expect((await repo.getPieces()).map(p => p.id)).toEqual(['new', 'old']);
});
test('null successor prevents resurrection and rapid toggles preserve the last desired state', async () => {
    await db.tasks.put({
        id: 't', title: 'Practice', category: 'Piano', priority: 2, recurrence: 'Daily', scheduledDate: '2026-11-08', isCompleted: false, completedAtUtc: null, updatedAtUtc: '2026', nextOccurrenceId: null
    });
    await Promise.all([repo.toggleTask('t'), repo.toggleTask('t')]);
    await syncEngine.processOutbox();
    expect(await db.tasks.count()).toBe(1);
    expect((await db.tasks.get('t'))?.isCompleted).toBe(false);
    expect((await db.syncOutbox.orderBy('sequence').toArray()).map(i => i.payload.isCompleted)).toEqual([true, false]);
});
test.each([500, 'timeout'])('dependency %s persists visible retry and backoff', async (status) => {
    await orphanFixture();
    await db.syncOutbox.delete('parent');
    vi.stubGlobal('fetch', vi.fn(async (url) => {
        if (String(url).endsWith('/health'))
            return Response.json({});
        if (status === 'timeout')
            throw new TypeError('timeout');
        return Response.json({
            error: 'busy'
        }, {
            status: 500
        });
    }));
    await syncEngine.processOutbox();
    const item = await db.syncOutbox.get('child');
    expect(item?.nextAttemptAt).toBeGreaterThan(Date.now());
    expect(item?.lastError).toBeTruthy();
});
test('syncDown backfills only real server acknowledgements including old sessions', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => Response.json(String(url).endsWith('/tasks') ? [] : [{
            id: 'p', sessions: [{
                    id: 's'
                }]
        }])));
    await syncEngine.syncDown();
    expect((await db.syncMeta.get('ack:session:s'))?.value).toBe(1);
});
test('optimistic piece with rejected create never receives an ack', async () => {
    await repo.createPiece({
        id: 'p', title: 'Local', composer: 'C', bucket: 'MainChallenge'
    });
    await syncEngine.processOutbox();
    const item = (await db.syncOutbox.toArray())[0];
    await db.deadLetterOutbox.put({
        ...item, failedAtUtc: '2026', failureReason: 'rejected', httpStatus: 400
    });
    await db.syncOutbox.clear();
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
    await syncEngine.syncDown();
    expect(await db.syncMeta.get('ack:piece:p')).toBeUndefined();
});
test.each([200, 404])('task list response %s does not cascade', async (status) => {
    await db.syncOutbox.put({
        id: 'complete', timestampUtc: '2026', operationType: 'SET_COMPLETED', endpoint: '/api/tasks/missing/completion', method: 'PATCH', payload: {
            isCompleted: true
        }, dependencies: ['task:missing']
    });
    vi.stubGlobal('fetch', vi.fn(async (url) => Response.json([], {
        status: String(url).endsWith('/health') ? 200 : status
    })));
    await syncEngine.processOutbox();
    expect(await db.syncOutbox.get('complete')).toBeTruthy();
    expect(await db.deadLetterOutbox.count()).toBe(0);
});
test('successful dependency GET acknowledges server sessions without acknowledging optimistic siblings', async () => {
    await orphanFixture();
    await db.syncOutbox.delete('parent');
    vi.stubGlobal('fetch', vi.fn(async (url, init) => Response.json(String(url).endsWith('/p') && !init?.method ? {
        id: 'p', sessions: [{
                id: 'existing'
            }]
    } : [])));
    await syncEngine.processOutbox();
    expect((await db.syncMeta.get('ack:session:existing'))?.value).toBe(1);
});
