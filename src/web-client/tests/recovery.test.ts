import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import { db } from '../src/services/db';
import { cadenceRepository as repo } from '../src/services/cadenceRepository';
import { syncEngine } from '../src/services/syncEngine';
beforeEach(async()=>{await db.open();});afterEach(async()=>{vi.unstubAllGlobals();await db.delete();});
test.each([401,403,429])('%s retains queued work with a persisted retry deadline',async(status)=>{
 await repo.createPiece({id:'piece',title:'Piece',composer:'Composer',bucket:'MainChallenge'});let posts=0;
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{if(init?.method==='POST'){posts++;return Response.json({error:'retry later'},{status,headers:{'Retry-After':'120'}});}return Response.json([]);}));
 const now=Date.now();await syncEngine.processOutbox();const item=await db.syncOutbox.toCollection().first();expect(item?.nextAttemptAt).toBeGreaterThan(now);if(status===429)expect(item?.nextAttemptAt).toBeGreaterThanOrEqual(now+120000);expect(await db.deadLetterOutbox.count()).toBe(0);await syncEngine.processOutbox();expect(posts).toBe(1);
});
test('legacy recording never sends automatically; export preserves blob and explicit retry enables sending',async()=>{
 const original=new Blob(['synthetic recording']);
 await db.pendingTakesOutbox.add({id:'legacy',pieceId:'piece',sessionId:'session',scope:'PassageClip',targetSection:'bars',userSelfReflection:'',attachedPdfPages:'',includeVideoPostureAnalysis:false,mediaBlob:original,originalFileName:'old.wav',mimeType:'audio/wav',createdAtUtc:'2026-11-07',legacyReview:true,syncError:'Check the session before retrying'});
 await db.syncMeta.bulkPut([{key:'ack:piece:piece',value:1},{key:'ack:session:session',value:1}]);let posts=0;vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{if(init?.method==='POST')posts++;return Response.json(init?.method==='POST'?{id:'legacy'}:[]);}));
 await syncEngine.processOutbox();expect(posts).toBe(0);const exported=await syncEngine.exportWork('take','legacy');expect(await exported.recording!.text()).toBe('synthetic recording');expect(exported.metadata.originalFileName).toBe('old.wav');
 await syncEngine.retryWork('take','legacy');await syncEngine.processOutbox();expect(posts).toBe(1);
});
test('parked legacy toggle exports original payload and needs an explicit desired state',async()=>{
 const original={id:'old',operationType:'TOGGLE_TASK' as const,endpoint:'/api/tasks/task/toggle',method:'PATCH' as const,payload:{clientDate:'2026-11-07'},timestampUtc:'2026'};
 await db.deadLetterOutbox.add({...original,originalOperations:[original],failedAtUtc:'2026',failureReason:'Legacy toggle',httpStatus:null});
 expect((await syncEngine.exportWork('mutation','old')).metadata.originalOperations).toEqual([original]);await expect(syncEngine.retryWork('mutation','old')).rejects.toThrow(/completed state/);
 await syncEngine.retryWork('mutation','old',true);expect((await db.syncOutbox.get('old'))?.payload.isCompleted).toBe(true);expect((await db.syncOutbox.get('old'))?.endpoint).toMatch(/completion$/);
});
test('409 is visible as a conflict and its optimistic row remains',async()=>{
 await repo.createPiece({id:'piece',title:'Local intent',composer:'Composer',bucket:'MainChallenge'});
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>init?.method==='POST'?Response.json({error:'create_conflict'},{status:409}):Response.json([])));
 await syncEngine.processOutbox();await syncEngine.syncDown();const work=await syncEngine.listWork();expect(work.failed[0].reason).toMatch(/conflict/i);expect((await db.pieces.get('piece'))?.title).toBe('Local intent');
});
test('canonical successor keeps newer local intent and reopening does not erase it',async()=>{
 const parent={id:'parent',title:'Practice',category:'Piano' as const,priority:2,recurrence:'Daily' as const,scheduledDate:'2026-11-08',isCompleted:true,completedAtUtc:'2026',updatedAtUtc:'2026',nextOccurrenceId:'local-next'};
 await db.tasks.bulkPut([parent,{...parent,id:'local-next',isCompleted:true,nextOccurrenceId:undefined}]);
 await db.syncOutbox.add({id:'child-op',timestampUtc:'2026',operationType:'SET_COMPLETED',endpoint:'/api/tasks/local-next/completion',method:'PATCH',payload:{isCompleted:true},dependencies:['task:local-next']});
 await syncEngine.applyCompletion('parent','local-next',{task:parent,nextOccurrence:{...parent,id:'canonical',isCompleted:false,nextOccurrenceId:undefined}});
 expect((await db.tasks.get('canonical'))?.isCompleted).toBe(true);expect((await db.syncOutbox.get('child-op'))?.dependencies).toEqual(['task:canonical']);
 await syncEngine.applyCompletion('parent','canonical',{task:{...parent,isCompleted:false},nextOccurrence:null});expect(await db.tasks.get('canonical')).toBeTruthy();expect((await db.tasks.get('parent'))?.nextOccurrenceId).toBe('canonical');
});
test('Retry-After HTTP date is honored and manual retry cannot bypass it',async()=>{
 await repo.createPiece({id:'piece',title:'Piece',composer:'Composer',bucket:'MainChallenge'});const deadline=new Date(Date.now()+120000).toUTCString();
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>init?.method==='POST'?Response.json({error:'rate limit'},{status:429,headers:{'Retry-After':deadline}}):Response.json([])));
 await syncEngine.processOutbox();const item=(await db.syncOutbox.toArray())[0];expect(item.nextAttemptAt).toBeGreaterThanOrEqual(Date.parse(deadline));await syncEngine.retryWork('mutation',item.id);expect((await db.syncOutbox.get(item.id))?.nextAttemptAt).toBe(item.nextAttemptAt);
});
test('explicit discard removes only the selected recording',async()=>{
 const base={pieceId:'piece',sessionId:'session',scope:'PassageClip' as const,targetSection:'',userSelfReflection:'',attachedPdfPages:'',includeVideoPostureAnalysis:false,mediaBlob:new Blob(['synthetic']),originalFileName:'take.wav',mimeType:'audio/wav',createdAtUtc:'2026',syncError:'review'};
 await db.pendingTakesOutbox.bulkAdd([{...base,id:'discard'},{...base,id:'keep'}]);await syncEngine.discardWork('take','discard');expect(await db.pendingTakesOutbox.get('discard')).toBeUndefined();expect(await db.pendingTakesOutbox.get('keep')).toBeTruthy();
});
test('newer desired state survives the acknowledgement of an earlier completion',async()=>{
 const task={id:'task',title:'Practice',category:'Piano' as const,priority:2,scheduledDate:null,isCompleted:false,completedAtUtc:null,updatedAtUtc:'2026'};await db.tasks.put(task);
 for(const [index,isCompleted] of [true,false].entries())await db.syncOutbox.add({id:`operation-${index}`,sequence:index+1,operationType:'SET_COMPLETED',endpoint:'/api/tasks/task/completion',method:'PATCH',payload:{isCompleted},timestampUtc:'2026'});
 await syncEngine.applyCompletion('task',undefined,{task:{...task,isCompleted:true},nextOccurrence:null});expect((await db.tasks.get('task'))?.isCompleted).toBe(false);
});
