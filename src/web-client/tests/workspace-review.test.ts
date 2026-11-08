import { expect, test } from 'vitest';
import { recordingMimeType } from '../src/features/music/PieceWorkspace';
test.each([['clip.mp4','video/mp4'],['clip.mp3','audio/mpeg'],['clip.wav','audio/wav']])('empty browser type for %s falls back to %s',(name,type)=>{
 expect(recordingMimeType(new File(['synthetic'],name))).toBe(type);
});
