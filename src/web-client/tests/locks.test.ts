import { afterEach,beforeEach,expect,test,vi } from 'vitest';
import { db, CadenceLocalDb } from '../src/services/db';
import { SyncEngine } from '../src/services/syncEngine';
import { cadenceRepository as repo } from '../src/services/cadenceRepository';
export class FakeLocks {
 held=false;
 async request(_name:string,options:{ifAvailable:boolean},callback:(lock:object|null)=>Promise<any>){expect(options.ifAvailable).toBe(true);if(this.held)return callback(null);this.held=true;try{return await callback({});}finally{this.held=false;}}
}
beforeEach(async()=>{await db.open();await repo.createPiece({id:'piece',title:'Piece',composer:'Composer',bucket:'MainChallenge'});});afterEach(async()=>{vi.unstubAllGlobals();await db.delete();});
test('two instances sharing IndexedDB send one POST; contender skips instead of waiting',async()=>{
 const locks=new FakeLocks();const other=new CadenceLocalDb(db.name);await other.open();
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let entered!:()=>void;const started=new Promise<void>(r=>entered=r);let posts=0;
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{if(init?.method==='POST'){posts++;entered();await gate;return Response.json({id:'piece'});}return Response.json([]);}));
 const first=new SyncEngine(db,{locks}).processOutbox();await started;await new SyncEngine(other,{locks}).processOutbox();expect(posts).toBe(1);release();await first;expect(locks.held).toBe(false);other.close();
});
test('request failure releases lock and the second tab picks up retained work',async()=>{
 const locks=new FakeLocks();let posts=0;vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{if(init?.method==='POST'){if(++posts===1)throw new TypeError('offline');return Response.json({id:'piece'});}return Response.json([]);}));
 await new SyncEngine(db,{locks}).processOutbox();expect(locks.held).toBe(false);expect(await db.syncOutbox.count()).toBe(1);await db.syncOutbox.toCollection().modify({nextAttemptAt:0});await new SyncEngine(db,{locks}).processOutbox();expect(posts).toBe(2);expect(await db.syncOutbox.count()).toBe(0);
});
test('missing Web Locks pauses outgoing work with a reason',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const engine=new SyncEngine(db,{locks:null});let message='';engine.subscribe(s=>message=s.lastError ?? '');await engine.processOutbox();expect(fetcher).not.toHaveBeenCalled();expect(await db.syncOutbox.count()).toBe(1);expect(message).toMatch(/HTTPS or localhost/);
});
test.each(['timeout','cancel'])('%s releases ownership and preserves queued work',async(mode)=>{
 const locks=new FakeLocks();const controller=new AbortController();let entered!:()=>void;const started=new Promise<void>(r=>entered=r);
 vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{if(init?.method==='POST'){entered();return new Promise((_resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});}return Response.json([]);}));
 const run=new SyncEngine(db,{locks,timeoutMs:mode==='timeout'?30:10000}).processOutbox(controller.signal);await started;if(mode==='cancel')controller.abort();await run;expect(locks.held).toBe(false);expect(await db.syncOutbox.count()).toBe(1);
});
