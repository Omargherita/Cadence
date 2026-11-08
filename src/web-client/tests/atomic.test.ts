import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import { db } from '../src/services/db';
import { cadenceRepository as repo } from '../src/services/cadenceRepository';
import { syncEngine } from '../src/services/syncEngine';
beforeEach(async()=>{vi.spyOn(syncEngine,'triggerSync').mockImplementation(()=>{});await db.open();vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('offline');}));});
afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllGlobals();await db.delete();});
test('outbox failure rolls back the optimistic row',async()=>{
 const reject=()=>{throw new Error('injected storage failure');};db.syncOutbox.hook('creating',reject);
 try{await expect(repo.createTask({id:'atomic',title:'Practice',category:'Piano'})).rejects.toThrow('injected');expect(await db.tasks.get('atomic')).toBeUndefined();}finally{db.syncOutbox.hook('creating').unsubscribe(reject);}
});
test('stale download cannot erase a newer operation even after acknowledgement',async()=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 vi.stubGlobal('fetch',vi.fn(async()=>{await gate;return Response.json([]);}));
 const download=syncEngine.syncDown();await new Promise(r=>setTimeout(r,10));
 await db.syncOutbox.add({id:'block',operationType:'CREATE_TASK',endpoint:'/api/tasks',method:'POST',timestampUtc:'2026'});
 await repo.createTask({id:'new',title:'New',category:'Piano'});
 await db.syncOutbox.clear(); // Simulate acknowledgement before the old GET returns.
 release();await download;expect(await db.tasks.get('new')).toBeTruthy();
});
test('failed work and parked recordings protect optimistic caches',async()=>{
 await db.tasks.put({id:'failed',title:'Keep me',category:'Piano',priority:2,scheduledDate:null,isCompleted:false,completedAtUtc:null,updatedAtUtc:'2026'});
 await db.deadLetterOutbox.add({id:'op',operationType:'CREATE_TASK',endpoint:'/api/tasks',method:'POST',timestampUtc:'2026',payload:{id:'failed'},failedAtUtc:'2026',failureReason:'rejected',httpStatus:400});
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json([])));await syncEngine.syncDown();expect(await db.tasks.get('failed')).toBeTruthy();
});
