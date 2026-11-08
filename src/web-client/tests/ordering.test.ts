import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { db } from '../src/services/db';
import { cadenceRepository as repo } from '../src/services/cadenceRepository';
import { syncEngine } from '../src/services/syncEngine';
beforeEach(async () => {
    vi.spyOn(syncEngine, 'triggerSync').mockImplementation(() => {
    });
    await db.open();
});
afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await db.delete();
});
async function queue() {
    await repo.createPiece({
        id: 'piece', title: 'Piece', composer: 'Composer', bucket: 'MainChallenge'
    });
    await repo.logPracticeSession('piece', {
        id: 'session', startedAtUtc: '1999-01-01', durationMinutes: 5
    });
    await repo.queueOfflineTake({
        id: 'take', pieceId: 'piece', sessionId: 'session', scope: 'PassageClip', targetSection: '', userSelfReflection: '', attachedPdfPages: '', includeVideoPostureAnalysis: false, mediaBlob: new Blob(['synthetic']), originalFileName: 'take.wav', mimeType: 'audio/wav', createdAtUtc: '1980-01-01'
    });
}
test('offline parents precede a backdated session and take', async () => {
    await queue();
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
        if (init?.method === 'POST') {
            sent.push(String(url));
            const id = String(url).endsWith('/takes') ? 'take' : String(url).endsWith('/sessions') ? 'session' : 'piece';
            return Response.json({
                id
            });
        }
        return Response.json(String(url).endsWith('/health') ? {} : []);
    }));
    await syncEngine.processOutbox();
    expect(sent.map(u => u.split('/').at(-1))).toEqual(['pieces', 'sessions', 'takes']);
});
test('parent 503 never sends its session or recording', async () => {
    await queue();
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
        if (init?.method === 'POST') {
            sent.push(String(url));
            return Response.json({
                error: 'busy'
            }, {
                status: 503
            });
        }
        return Response.json({});
    }));
    await syncEngine.processOutbox();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/pieces$/);
    expect(await db.pendingTakesOutbox.count()).toBe(1);
    expect((await db.pendingTakesOutbox.get('take'))?.syncError).toBeUndefined();
});
test('a failed parent keeps children pending without attempting them', async () => {
    await queue();
    vi.stubGlobal('fetch', vi.fn(async (url, init) => init?.method === 'POST' ? Response.json({
        error: 'invalid'
    }, {
        status: 400
    }) : Response.json({})));
    await syncEngine.processOutbox();
    expect(await db.deadLetterOutbox.count()).toBe(1);
    expect(await db.syncOutbox.count()).toBe(1);
    expect((await db.pendingTakesOutbox.get('take'))?.attempts).toBeUndefined();
});
