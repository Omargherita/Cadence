export function StatusGlyph({progress=0,label,tone='violet'}:{progress?:number;label:string;tone?:'violet'|'blue'|'amber'}) {
 const colors={violet:'#A78BFA',blue:'#60A5FA',amber:'#FBBF24'};
 return <svg role="img" aria-label={label} width="14" height="14" viewBox="0 0 16 16" style={{color:colors[tone],flexShrink:0}}><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" opacity=".4" strokeWidth="1.5" strokeDasharray={progress===0?'2 2':undefined}/>{progress>0&&<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" pathLength="1" strokeDasharray={`${Math.min(progress,1)} 1`} transform="rotate(-90 8 8)"/>}</svg>;
}
