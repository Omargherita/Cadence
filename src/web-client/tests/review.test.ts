import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { db } from '../src/services/db';
import { cadenceRepository as repo } from '../src/services/cadenceRepository';
import { syncEngine } from '../src/services/syncEngine';
beforeEach(async () => { await db.open(); vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); })); });
afterEach(async () => { await syncEngine.processOutbox(); vi.unstubAllGlobals(); await db.delete(); });
test('five rapid creates sync in order once without awaiting the network', async () => {
 const sent: string[] = []; let release!: () => void; const gate = new Promise<void>(r => release = r);
 vi.stubGlobal('fetch', vi.fn(async (_url, init) => { if (init?.method === 'POST') { await gate; sent.push(JSON.parse(String(init.body)).id); } return Response.json([]); }));
 await Promise.all(Array.from({length:5}, (_,i) => repo.createTask({id:`task-${i}`,title:'Practice',category:'Piano'})));
 await new Promise(r=>setTimeout(r,20)); const active = syncEngine['isSyncing'];
 release(); expect(active).toBe(true); await syncEngine.processOutbox(); expect(sent).toEqual(['task-0','task-1','task-2','task-3','task-4']);
});
test('legacy piece resource keys do not let failed session A block session B', async () => {
 const base={timestampUtc:'2026',operationType:'LOG_SESSION' as const,endpoint:'/api/pieces/p/sessions',method:'POST' as const,resourceKey:'piece:p',dependencies:['piece:p']};
 await db.syncMeta.put({key:'ack:piece:p',value:1});
 await db.deadLetterOutbox.put({...base,id:'a',sequence:1,payload:{id:'a'},failedAtUtc:'2026',failureReason:'invalid',httpStatus:400});
 await db.syncOutbox.put({...base,id:'b',sequence:2,payload:{id:'b'}});
 const sent:string[]=[];vi.stubGlobal('fetch',vi.fn(async (_url,init)=>{if(init?.method==='POST')sent.push(JSON.parse(String(init.body)).id);return Response.json([]);}));
 await syncEngine.processOutbox();expect(sent).toEqual(['b']);
});
async function orphanFixture() {
 await db.syncOutbox.bulkPut([
 {id:'parent',timestampUtc:'2026',operationType:'CREATE_PIECE',endpoint:'/api/pieces',method:'POST',payload:{id:'p'}},
 {id:'child',timestampUtc:'2026',operationType:'LOG_SESSION',endpoint:'/api/pieces/p/sessions',method:'POST',payload:{id:'s'},dependencies:['piece:p']},
 ]);
 await db.pendingTakesOutbox.put({id:'take',pieceId:'p',sessionId:'s',scope:'PassageClip',targetSection:'',userSelfReflection:'',attachedPdfPages:'',includeVideoPostureAnalysis:false,mediaBlob:new Blob(['retained']),originalFileName:'test.wav',mimeType:'audio/wav',createdAtUtc:'2026',dependencies:['piece:p','session:s']});
}
test('discarding a parent parks descendants and retains exportable data',async()=>{
 await orphanFixture();await syncEngine.discardWork('mutation','parent');
 expect((await syncEngine.listWork()).failed).toHaveLength(2);
 expect(await (await syncEngine.exportWork('take','take')).recording!.text()).toBe('retained');
 expect(await db.syncOutbox.count()).toBe(0);
});
test.each([404,500,'timeout'])('dependency response %s only cascades on explicit 404',async(status)=>{
 await orphanFixture();await db.syncOutbox.delete('parent');
 vi.stubGlobal('fetch',vi.fn(async url=>{if(String(url).endsWith('/health'))return Response.json({});if(status==='timeout')throw new TypeError('timeout');return Response.json({}, {status:Number(status)});}));
 await syncEngine.processOutbox();
 expect((await syncEngine.listWork()).failed.length).toBe(status===404?2:0);
});
