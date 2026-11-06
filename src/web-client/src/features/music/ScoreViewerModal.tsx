import { X, ExternalLink } from 'lucide-react';
import { api } from '../../services/api';
import { useModalFocus } from '../../components/useModalFocus';
interface Props {isOpen:boolean;onClose:()=>void;pieceId:string;pieceTitle:string;composer:string}
export function ScoreViewerModal({isOpen,onClose,pieceId,pieceTitle,composer}:Props) {
 const ref=useModalFocus(isOpen,onClose,window.innerWidth<1024);
 if(!isOpen)return null;
 return <div className="score-dock" ref={ref} role="region" aria-label="Sheet music reader">
   <div className="score-dock-heading"><div><h2>{pieceTitle}</h2><p>{composer}</p></div><a className="icon-button" href={api.getScoreUrl(pieceId)} target="_blank" rel="noreferrer" aria-label="Open score in new tab"><ExternalLink size={16}/></a><button className="icon-button" aria-label="Close score" onClick={onClose}><X size={18}/></button></div>
   <iframe title={`Sheet music for ${pieceTitle}`} src={api.getScoreUrl(pieceId)} />
 </div>;
}
