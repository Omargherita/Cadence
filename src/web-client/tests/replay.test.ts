import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Dexie from 'dexie';
import { db, CadenceLocalDb } from '../src/services/db';
import { SyncEngine } from '../src/services/syncEngine';
import { cadenceRepository } from '../src/services/cadenceRepository';
const task = { id:'task',title:'Practice',category:'Piano' as const,priority:2,scheduledDate:null,isCompleted:false,completedAtUtc:null,updatedAtUtc:'2026-11-08',recurrence:'None' as const };
export const take = { id:'take',pieceId:'piece',sessionId:'session',scope:'PassageClip' as const,targetSection:'bars',userSelfReflection:'',attachedPdfPages:'',includeVideoPostureAnalysis:false,mediaBlob:new Blob(['synthetic']),originalFileName:'take.wav',mimeType:'audio/wav',createdAtUtc:'2026-11-08' };
beforeEach(async()=> { await db.open(); });
afterEach(async()=> { vi.unstubAllGlobals(); await db.delete(); });
test('completion sends desired state, never a toggle', async()=>{
 await db.tasks.put(task);
 await db.syncMeta.put({key:`ack:task:${task.id}`,value:1});
 const fetcher=vi.fn(async()=>Response.json({task:{...task,isCompleted:true},nextOccurrence:null}));vi.stubGlobal('fetch',fetcher);
 await cadenceRepository.toggleTask(task.id);
 await new SyncEngine().processOutbox();
 const request=fetcher.mock.calls.find(c=>String(c[0]).includes('/completion'));
 expect(request).toBeTruthy();expect(JSON.parse(request![1].body as string).isCompleted).toBe(true);
});
test('retry carries the original take ID',async()=>{
 await db.pendingTakesOutbox.add(take);
 await db.syncMeta.bulkPut([{key:"ack:piece:piece",value:1},{key:"ack:session:session",value:1}]);
 const ids:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url,init)=>{ if(String(url).endsWith('/takes')){ids.push(init.body.get('id'));throw new TypeError('lost reply');}return Response.json({}); }));
 const engine=new SyncEngine();await engine.processOutbox();await db.pendingTakesOutbox.update(take.id,{nextAttemptAt:0});await engine.processOutbox();expect(ids).toEqual(['take','take']);
});
test('upgrade converts clear toggles and parks ambiguous history and old recordings',async()=>{
 const name='migration-'+crypto.randomUUID();const old=new Dexie(name);
 old.version(3).stores({tasks:'id',pieces:'id',syncOutbox:'id,timestampUtc,operationType',pendingTakesOutbox:'id,pieceId,sessionId,createdAtUtc',deadLetterOutbox:'id,failedAtUtc'});
 await old.table('tasks').put({...task,isCompleted:true});
 await old.table('syncOutbox').bulkPut([{id:'clear',operationType:'TOGGLE_TASK',endpoint:'/api/tasks/task/toggle',method:'PATCH',timestampUtc:'2026',payload:{clientDate:'2026-11-08'}},{id:'missing',operationType:'TOGGLE_TASK',endpoint:'/api/tasks/missing/toggle',method:'PATCH',timestampUtc:'2026',payload:{clientDate:'2026-11-07'}}]);
 await old.table('pendingTakesOutbox').add(take);old.close();
 const upgraded=new CadenceLocalDb(name);await upgraded.open();
 expect((await upgraded.syncOutbox.get('clear'))?.payload.isCompleted).toBe(true);
 expect((await upgraded.deadLetterOutbox.get('missing'))?.originalOperations?.[0].payload.clientDate).toBe('2026-11-07');
 expect((await upgraded.pendingTakesOutbox.get('take'))?.legacyReview).toBe(true);
 await upgraded.pendingTakesOutbox.add({...take,id:'new'});expect((await upgraded.pendingTakesOutbox.get('new'))?.syncError).toBeUndefined();
 await upgraded.delete();
});
test('an empty legacy database creates no review entries on upgrade',async()=>{
 const name='empty-'+crypto.randomUUID();const old=new Dexie(name);old.version(3).stores({tasks:'id',pieces:'id',syncOutbox:'id,timestampUtc,operationType',pendingTakesOutbox:'id,pieceId,sessionId,createdAtUtc',deadLetterOutbox:'id,failedAtUtc'});await old.open();old.close();const upgraded=new CadenceLocalDb(name);await upgraded.open();expect(await upgraded.deadLetterOutbox.count()).toBe(0);expect(await upgraded.pendingTakesOutbox.count()).toBe(0);await upgraded.delete();
});
