import { FC } from 'react';
import { X, ExternalLink, FileText } from 'lucide-react';
import { api } from '../../services/api';

interface ScoreViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pieceId: string;
  pieceTitle: string;
  composer: string;
}

export const ScoreViewerModal: FC<ScoreViewerModalProps> = ({
  isOpen,
  onClose,
  pieceId,
  pieceTitle,
  composer,
}) => {
  if (!isOpen) return null;

  const scoreUrl = api.getScoreUrl(pieceId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-6xl h-[92vh] flex flex-col rounded-2xl bg-[#111622] border border-[#1E2638] shadow-2xl shadow-black/90 overflow-hidden"
        role="dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1E2638] bg-[#0B0E14]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-950/70 text-blue-400 border border-blue-800/60">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#F0F4F8] tracking-tight">
                {pieceTitle}
              </h2>
              <span className="text-xs font-mono text-slate-400">
                {composer} • Visual Score Reader
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={scoreUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#111622] hover:bg-[#1A202C] text-slate-300 hover:text-white border border-[#1E2638] transition-colors"
              title="Open PDF in new browser tab"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Open in Tab</span>
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1A202C] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Embedded PDF Viewer */}
        <div className="flex-1 bg-[#0B0E14] relative">
          <iframe
            src={`${scoreUrl}#toolbar=1&navpanes=0`}
            title={`Sheet music for ${pieceTitle}`}
            className="w-full h-full border-none"
          />
        </div>
      </div>
    </div>
  );
};
