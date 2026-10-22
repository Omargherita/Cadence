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

interface TakeStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  pieceTitle: string;
  defaultTargetSection?: string;
  onUploadTake: (formData: FormData) => Promise<void>;
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

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      // Auto-enable video posture option if it's a video file
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

      await onUploadTake(formData);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to analyze take');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isVideoFile = file?.type.startsWith('video/') || file?.name.endsWith('.mp4');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-xl rounded-2xl bg-[#111622] border border-[#1E2638] shadow-2xl shadow-black/90 p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto"
        role="dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1E2638]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-950/70 text-violet-400 border border-violet-800/60">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#F0F4F8] tracking-tight">
                Practice Take Studio
              </h2>
              <span className="text-xs font-mono text-slate-400">
                {pieceTitle} • Multi-Take AI Coaching
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1A202C] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300 font-mono">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Take Scope Selector */}
          <div className="space-y-1.5">
            <label className="block text-slate-400 font-mono text-[11px] uppercase tracking-wider">
              Take Scope & Pedagogical Depth
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setScope('PassageClip')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  scope === 'PassageClip'
                    ? 'bg-violet-950/50 border-violet-500/80 ring-1 ring-violet-500 text-white'
                    : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:bg-[#1A202C]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Music className="w-3.5 h-3.5 text-violet-400" />
                  <span>Passage Clip</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-tight">
                  Micro-loop feedback focused on immediate drills and tension release.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScope('FullPerformance')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  scope === 'FullPerformance'
                    ? 'bg-blue-950/50 border-blue-500/80 ring-1 ring-blue-500 text-white'
                    : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:bg-[#1A202C]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>Full Performance</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-tight">
                  Masterclass critique with pacing, cantabile line, and long-range plan.
                </p>
              </button>
            </div>
          </div>

          {/* File Picker */}
          <div className="space-y-1.5">
            <label className="block text-slate-400 font-mono text-[11px] uppercase tracking-wider">
              Upload Video (.mp4) or Audio (.mp3/.wav) <span className="text-violet-400">*</span>
            </label>
            <div className="relative border-2 border-dashed border-[#1E2638] hover:border-violet-500/60 rounded-xl p-4 sm:p-5 text-center bg-[#0B0E14] transition-colors">
              <input
                type="file"
                required
                accept="audio/*,video/*,.mp3,.mp4,.wav,.m4a,.mov,.webm"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-2 pointer-events-none">
                <div className="p-2.5 rounded-full bg-[#111622] text-violet-400 border border-[#1E2638]">
                  {isVideoFile ? <Film className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                </div>
                {file ? (
                  <div>
                    <span className="block font-semibold text-xs text-white">
                      {file.name}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || 'Media file'}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="block font-semibold text-xs text-[#F0F4F8]">
                      Click or drag media file to upload take
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Supports phone mic recordings and video takes (.mp4, .mp3, .wav)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Video Posture Toggle */}
          {isVideoFile && (
            <label className="flex items-center gap-3 p-3 rounded-xl bg-[#0B0E14] border border-blue-900/40 cursor-pointer">
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
              <label className="block text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                Target Section
              </label>
              <input
                type="text"
                value={targetSection}
                onChange={(e) => setTargetSection(e.target.value)}
                placeholder="e.g. Measures 208-264 (Coda)"
                className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-violet-500 rounded-xl px-3.5 py-2 text-xs text-[#F0F4F8] placeholder-slate-500 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                Attached Score Pages
              </label>
              <input
                type="text"
                value={attachedPdfPages}
                onChange={(e) => setAttachedPdfPages(e.target.value)}
                placeholder="e.g. 5-7"
                className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-violet-500 rounded-xl px-3.5 py-2 text-xs text-[#F0F4F8] placeholder-slate-500 outline-none"
              />
            </div>
          </div>

          {/* Self-Reflection Input */}
          <div className="space-y-1">
            <label className="block text-slate-400 font-mono text-[11px] uppercase tracking-wider">
              Self-Reflection (What felt tense, fluid, or improved?)
            </label>
            <textarea
              rows={2}
              value={selfReflection}
              onChange={(e) => setSelfReflection(e.target.value)}
              placeholder="e.g. Right hand thumb felt more relaxed; struggled to keep left hand leaps quiet."
              className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-violet-500 rounded-xl px-3.5 py-2 text-xs text-[#F0F4F8] placeholder-slate-500 outline-none resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1E2638]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#0B0E14] text-slate-400 hover:text-white border border-[#1E2638] hover:bg-[#1A202C] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white shadow-lg shadow-violet-600/20 active:scale-98 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Maestro Analyzing Take...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-violet-200" />
                  <span>Submit Take for Assessment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
