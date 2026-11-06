import { useModalFocus } from '../../components/useModalFocus';
import React, { FC, useState } from 'react';
import {
  Camera,
  Film,
  Loader2,
  Mic,
  Music,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { TakeScope } from '../../types/cadence';

export interface TakeUploadMetadata {
  file: File;
  scope: TakeScope;
  targetSection: string;
  userSelfReflection: string;
  attachedPdfPages: string;
  includeVideoPostureAnalysis: boolean;
}

interface TakeStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  pieceTitle: string;
  defaultTargetSection?: string;
  onUploadTake: (formData: FormData, metadata: TakeUploadMetadata) => Promise<void>;
}

export const TakeStudioModal: FC<TakeStudioModalProps> = ({
  isOpen,
  onClose,
  pieceTitle,
  defaultTargetSection = '',
  onUploadTake,
}) => {
  const [scope, setScope] = useState<TakeScope>('PassageClip');
  const [targetSection, setTargetSection] = useState(defaultTargetSection);
  const [selfReflection, setSelfReflection] = useState('');
  const [attachedPdfPages, setAttachedPdfPages] = useState('');
  const [includeVideoPosture, setIncludeVideoPosture] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dialogRef = useModalFocus(isOpen, () => { if (!isSubmitting) onClose(); });
  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      // Au video posture option if it's a video file
      if (selected.type.startsWith('video/') || selected.name.endsWith('.mp4')) {
        setIncludeVideoPosture(true);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('scope', scope);
      formData.append('targetSection', targetSection.trim());
      formData.append('userSelfReflection', selfReflection.trim());
      formData.append('attachedPdfPages', attachedPdfPages.trim());
      formData.append('includeVideoPostureAnalysis', includeVideoPosture ? 'true' : 'false');
      formData.append('sourceQuality', 'PhoneMicCompressed');

      await onUploadTake(formData, {
        file,
        scope,
        targetSection: targetSection.trim(),
        userSelfReflection: selfReflection.trim(),
        attachedPdfPages: attachedPdfPages.trim(),
        includeVideoPostureAnalysis: includeVideoPosture,
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to analyze take');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isVideoFile = file?.type.startsWith('video/') || file?.name.endsWith('.mp4');

  return (
    <div onClick={e => { if(e.target === e.currentTarget && !isSubmitting) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85   duration-150">
      <div
        className="relative w-full max-w-xl rounded-lg bg-[#111622] border border-[#1E2638]   p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto"
        ref={dialogRef} role="dialog" aria-modal="true" aria-label="Upload practice take"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1E2638]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-violet-950/70 text-violet-400 border border-violet-800/60">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-[#F0F4F8] tracking-tight">
                Upload practice take
              </h2>
              <span className="text-xs font-mono text-slate-400">
                {pieceTitle} • Practice feedback
              </span>
            </div>
          </div>

          <button
            onClick={onClose} aria-label="Close dialog"
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1A202C] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="document-section p-3     text-xs text-amber-300 font-mono">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Take Scope Selector */}
          <div className="space-y-1.5">
            <label className="block text-slate-400 font-mono text-xs  ">
              Feedback scope
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setScope('PassageClip')}
                className={`p-3 rounded-md border text-left transition-all cursor-pointer ${
                  scope === 'PassageClip'
                    ? 'bg-violet-950/50 border-violet-500/80 ring-1 ring-violet-500 text-white'
                    : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:bg-[#1A202C]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs">
                  <Music className="w-3.5 h-3.5 text-violet-400" />
                  <span>Passage Clip</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-tight">
                  Micro-loop feedback focused on immediate drills and tension release.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScope('FullPerformance')}
                className={`p-3 rounded-md border text-left transition-all cursor-pointer ${
                  scope === 'FullPerformance'
                    ? 'bg-blue-950/50 border-blue-500/80 ring-1 ring-blue-500 text-white'
                    : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:bg-[#1A202C]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>Full Performance</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-tight">
                  Masterclass critique with pacing, cantabile line, and long-range plan.
                </p>
              </button>
            </div>
          </div>

          {/* File Picker */}
          <div className="space-y-1.5">
            <label className="block text-slate-400 font-mono text-xs  ">
              Upload Video (.mp4) or Audio (.mp3/.wav) <span className="text-violet-400">*</span>
            </label>
            <div className="document-section relative    hover:  p-4 sm:p-5 text-center  transition-colors">
              <input
                type="file"
                required
                accept="audio/*,video/*,.mp3,.mp4,.wav,.m4a,.mov,.webm"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-2 pointer-events-none">
                <div className="p-2.5 rounded bg-[#111622] text-violet-400 border border-[#1E2638]">
                  {isVideoFile ? <Film className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                </div>
                {file ? (
                  <div>
                    <span className="block font-semibold text-xs text-white">
                      {file.name}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || 'Media file'}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="block font-semibold text-xs text-[#F0F4F8]">
                      Choose a media file
                    </span>
                    <span className="text-xs text-slate-400">
                      Supports phone mic recordings and video takes (.mp4, .mp3, .wav)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Video Posture Toggle */}
          {isVideoFile && (
            <label className="flex items-center gap-3 p-3 rounded-md bg-[#0B0E14] border border-blue-900/40 cursor-pointer">
              <input
                type="checkbox"
                checked={includeVideoPosture}
                onChange={(e) => setIncludeVideoPosture(e.target.checked)}
                className="rounded text-blue-600 focus:ring-0"
              />
              <div className="flex items-center gap-2 text-xs">
                <Camera className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-slate-300">
                  Request Video Posture & Hand Technique Analysis (Wrist angle, forearm alignment)
                </span>
              </div>
            </label>
          )}

          {/* Target Section & Score Pages */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-slate-400 font-mono text-xs  ">
                Target Section
              </label>
              <input
                type="text"
                value={targetSection}
                onChange={(e) => setTargetSection(e.target.value)}
                placeholder="e.g. Measures 208-264 (Coda)"
                className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-violet-500 rounded-md px-3.5 py-2 text-xs text-[#F0F4F8] placeholder-slate-500 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-400 font-mono text-xs  ">
                Attached Score Pages
              </label>
              <input
                type="text"
                value={attachedPdfPages}
                onChange={(e) => setAttachedPdfPages(e.target.value)}
                placeholder="e.g. 5-7"
                className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-violet-500 rounded-md px-3.5 py-2 text-xs text-[#F0F4F8] placeholder-slate-500 outline-none"
              />
            </div>
          </div>

          {/* Self-Reflection Input */}
          <div className="space-y-1">
            <label className="block text-slate-400 font-mono text-xs  ">
              Self-Reflection (What felt tense, fluid, or improved?)
            </label>
            <textarea
              rows={2}
              value={selfReflection}
              onChange={(e) => setSelfReflection(e.target.value)}
              placeholder="e.g. Right hand thumb felt more relaxed; struggled to keep left hand leaps quiet."
              className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-violet-500 rounded-md px-3.5 py-2 text-xs text-[#F0F4F8] placeholder-slate-500 outline-none resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1E2638]">
            <button
              type="button"
              onClick={onClose} aria-label="Close dialog"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-md text-xs font-semibold bg-[#0B0E14] text-slate-400 hover:text-white border border-[#1E2638] hover:bg-[#1A202C] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-md text-xs sm:text-sm font-semibold bg-[#1E2638] hover:bg-[#2E3A52] disabled:opacity-40 text-white   active:scale-98 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Maestro Analyzing Take...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-violet-200" />
                  <span>Analyze take</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
