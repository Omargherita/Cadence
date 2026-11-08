import { expect, test } from 'vitest';
import { recordingMimeType } from '../src/features/music/PieceWorkspace';
test.each([['clip.mp4','video/mp4'],['clip.mp3','audio/mpeg'],['clip.wav','audio/wav']])('empty browser type for %s falls back to %s',(name,type)=>{
 expect(recordingMimeType(new File(['synthetic'],name))).toBe(type);
});
import { consumeReviewSession } from '../src/features/music/PieceWorkspace';
import { vi } from 'vitest';
test('session jump is consumed once and later visits use the default',()=>{
 const values=new Map([['cadence-review-session',JSON.stringify({pieceId:'p',sessionId:'s'})]]);
 vi.stubGlobal('sessionStorage',{getItem:(key:string)=>values.get(key) ?? null,removeItem:(key:string)=>values.delete(key)});
 try {expect(consumeReviewSession('p')).toBe('s');expect(consumeReviewSession('p')).toBeNull();}finally{vi.unstubAllGlobals();}
});
