import { useModalFocus } from '../../components/useModalFocus';
import React, { FC, useState } from 'react';
import { X, Plus, Music, Target, BookOpen } from 'lucide-react';
import { CreatePieceRequest, RepertoireBucket } from '../../types/cadence';

interface AddPieceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (piece: CreatePieceRequest) => Promise<void>;
}

const BUCKET_OPTIONS: { value: RepertoireBucket; label: string; desc: string }[] = [
  {
    value: 'MainChallenge',
    label: 'Main Challenge',
    desc: 'Active deep focus repertoire demanding rigorous technical and expressive mastery',
  },
  {
    value: 'Maintenance',
    label: 'Maintenance',
    desc: 'Learned repertoire kept in performance shape with periodic retention runs',
  },
  {
    value: 'FutureExploration',
    label: 'Future Exploration',
    desc: 'Backlog pieces queued for future sight-reading or study',
  },
];

export const AddPieceModal: FC<AddPieceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [composer, setComposer] = useState('');
  const [bucket, setBucket] = useState<RepertoireBucket>('MainChallenge');
  const [personalGoals, setPersonalGoals] = useState('');
  const [interpretationNotes, setInterpretationNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dialogRef = useModalFocus(isOpen, () => { if (!isSubmitting) onClose(); });
  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !composer.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onSubmit({
        title: title.trim(),
        composer: composer.trim(),
        bucket,
        personalGoals: personalGoals.trim(),
        interpretationNotes: interpretationNotes.trim(),
      });
      // Reset form
      setTitle('');
      setComposer('');
      setPersonalGoals('');
      setInterpretationNotes('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div onClick={e => { if(e.target === e.currentTarget && !isSubmitting) onClose(); }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80   duration-150">
      <div
        className="relative w-full max-w-lg rounded-lg bg-[#111622] border border-[#1E2638]   p-6 space-y-5"
        ref={dialogRef} role="dialog" aria-modal="true" aria-label="Add piece"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1E2638]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-md bg-violet-950/70 text-violet-400 border border-violet-800/60">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#F0F4F8] tracking-tight">
                Add Repertoire Piece
              </h2>
              <p className="text-xs text-slate-400">
                Register a new piece into the Cadence Musical Library
              </p>
            </div>
          </div>
          <button
            onClick={onClose} aria-label="Close dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1A202C] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Title */}
          <div className="space-y-1">
            <label className="block text-slate-400 font-mono text-xs  ">
              Piece Title <span className="text-violet-400">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Ballade No. 1 in G minor, Op. 23"
              className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-violet-500 rounded-md px-3.5 py-2.5 text-sm text-[#F0F4F8] placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          {/* Composer */}
          <div className="space-y-1">
            <label className="block text-slate-400 font-mono text-xs  ">
              Composer <span className="text-violet-400">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={150}
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              placeholder="e.g. Frédéric Chopin"
              className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-violet-500 rounded-md px-3.5 py-2.5 text-sm text-[#F0F4F8] placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          {/* Repertoire Bucket */}
          <div className="space-y-1.5">
            <label className="block text-slate-400 font-mono text-xs  ">
              Repertoire Bucket
            </label>
            <div className="grid grid-cols-1 gap-2">
              {BUCKET_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-2.5 rounded-md border cursor-pointer transition-all ${
                    bucket === opt.value
                      ? 'bg-violet-950/40 border-violet-600/80 ring-1 ring-violet-500'
                      : 'bg-[#0B0E14] border-[#1E2638] hover:bg-[#1A202C]'
                  }`}
                >
                  <input
                    type="radio"
                    name="bucket"
                    value={opt.value}
                    checked={bucket === opt.value}
                    onChange={() => setBucket(opt.value)}
                    className="mt-0.5 text-violet-600 focus:ring-0"
                  />
                  <div>
                    <span className="block font-semibold text-xs text-[#F0F4F8]">
                      {opt.label}
                    </span>
                    <span className="block text-xs text-slate-400 leading-snug">
                      {opt.desc}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Personal Goals */}
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-slate-400 font-mono text-xs  ">
              <Target className="w-3 h-3 text-amber-400" />
              <span>Personal Goals (Optional)</span>
            </label>
            <input
              type="text"
              value={personalGoals}
              onChange={(e) => setPersonalGoals(e.target.value)}
              placeholder="e.g. Master presto con fuoco coda at 138 bpm with relaxed forearm"
              className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-violet-500 rounded-md px-3.5 py-2 text-xs text-[#F0F4F8] placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          {/* Interpretation Notes */}
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-slate-400 font-mono text-xs  ">
              <BookOpen className="w-3 h-3 text-blue-400" />
              <span>Interpretation Notes (Optional)</span>
            </label>
            <textarea
              rows={2}
              value={interpretationNotes}
              onChange={(e) => setInterpretationNotes(e.target.value)}
              placeholder="e.g. Sotto voce opening pacing; keep second theme cantabile expressive"
              className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-violet-500 rounded-md px-3.5 py-2 text-xs text-[#F0F4F8] placeholder-slate-500 outline-none transition-colors resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1E2638]">
            <button
              type="button"
              onClick={onClose} aria-label="Close dialog"
              className="px-4 py-2 rounded-md text-xs font-semibold bg-[#0B0E14] text-slate-400 hover:text-white border border-[#1E2638] hover:bg-[#1A202C] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !composer.trim() || isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold bg-[#1E2638] hover:bg-[#2E3A52] disabled:opacity-40 text-white   active:scale-98 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Piece</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
