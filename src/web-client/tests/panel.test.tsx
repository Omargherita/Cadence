import {expect,test} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
import {SyncWorkEntry} from '../src/components/SyncWorkPanel';
test('parked recording presents comparison details and explicit recovery actions',()=>{
 const item={id:'take',pieceId:'piece',sessionId:'session',scope:'PassageClip' as const,targetSection:'bars',userSelfReflection:'',attachedPdfPages:'',includeVideoPostureAnalysis:false,mediaBlob:new Blob(['test']),originalFileName:'old.wav',mimeType:'audio/wav',createdAtUtc:'2026-11-07',legacyReview:true,syncError:'This recording may already have uploaded with the previous app version. Check the session before retrying.'};
 const html=renderToStaticMarkup(<SyncWorkEntry entry={{kind:'take',id:'take',title:'Nocturne',reason:item.syncError,failed:true,item,pieceId:'piece',sessionId:'session',sessionDate:'2026-11-06',recordingTime:item.createdAtUtc,fileName:'old.wav',fileSize:4}} busy={false} onRetry={()=>{}} onExport={()=>{}} onDiscard={()=>{}} onOpenSession={()=>{}}/>);
 for(const text of ['Nocturne','2026-11-06','2026-11-07','old.wav','4 bytes','Check the session before retrying','Open session','Export details (JSON)','Download recording','Retry upload','Mark resolved / discard'])expect(html).toContain(text);
});
