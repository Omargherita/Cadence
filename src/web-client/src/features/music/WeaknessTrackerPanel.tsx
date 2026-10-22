import React, { FC, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Flame,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  CreateWeaknessRequest,
  PieceWeakness,
  WeaknessCategory,
} from '../../types/cadence';

interface WeaknessTrackerPanelProps {
  weaknesses: PieceWeakness[];
  onAddWeakness: (req: CreateWeaknessRequest) => Promise<void>;
  isLoading?: boolean;
}

const CATEGORY_OPTIONS: { value: WeaknessCategory; label: string }[] = [
  { value: 'Voicing', label: 'Voicing & Balance' },
  { value: 'PhysicalTension', label: 'Physical Tension' },
  { value: 'RhythmAndTempo', label: 'Rhythm & Rubato Tempo' },
  { value: 'PitchAccuracy', label: 'Pitch & Fingering Precision' },
  { value: 'DynamicsAndBalance', label: 'Dynamics & Color' },
  { value: 'ArticulationAndPedal', label: 'Articulation & Pedal' },
  { value: 'PhrasingAndRubato', label: 'Phrasing & Architecture' },
];

export const WeaknessTrackerPanel: FC<WeaknessTrackerPanelProps> = ({
  weaknesses,
  onAddWeakness,
}) => {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [category, setCategory] = useState<WeaknessCategory>('Voicing');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeWeaknesses = weaknesses.filter((w) => w.status === 'Active');
  const improvingWeaknesses = weaknesses.filter((w) => w.status === 'Improving');
  const resolvedWeaknesses = weaknesses.filter((w) => w.status === 'Resolved');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim() || !description.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onAddWeakness({
        category,
        location: location.trim(),
        description: description.trim(),
      });
      setLocation('');
      setDescription('');
      setIsAddFormOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl bg-[#111622] border border-[#1E2638] p-5 shadow-lg shadow-black/30 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#1E2638]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-950/70 text-amber-400 border border-amber-800/60">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#F0F4F8] tracking-tight">
              Deterministic Weakness State Machine
            </h3>
            <span className="text-[11px] font-mono text-slate-400">
              Requires 3 distinct clean calendar days to transition to Resolved
            </span>
          </div>
        </div>

        <button
          onClick={() => setIsAddFormOpen((prev) => !prev)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#0B0E14] hover:bg-[#1A202C] text-slate-300 hover:text-white border border-[#1E2638] transition-colors cursor-pointer"
        >
          {isAddFormOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 text-blue-400" />}
          <span>{isAddFormOpen ? 'Cancel' : 'Track Weakness'}</span>
        </button>
      </div>

      {/* Manual Add Form */}
      {isAddFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl bg-[#0B0E14] border border-blue-900/40 p-4 space-y-3 animate-in fade-in duration-150 text-xs"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-blue-400 font-mono text-[11px] uppercase tracking-wider">
              Register New Weakness Target
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-slate-400 text-[11px] font-mono">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as WeaknessCategory)}
                className="w-full bg-[#111622] border border-[#1E2638] focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-[#F0F4F8] outline-none"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-slate-400 text-[11px] font-mono">
                Location (Measure Range)
              </label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Measures 208-220 (Presto Coda)"
                className="w-full bg-[#111622] border border-[#1E2638] focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-[#F0F4F8] placeholder-slate-500 outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-slate-400 text-[11px] font-mono">
              Diagnostic Description
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Forearm tension on descending double octaves; LH leaps overshooting."
              className="w-full bg-[#111622] border border-[#1E2638] focus:border-blue-500 rounded-lg px-3 py-2 text-xs text-[#F0F4F8] placeholder-slate-500 outline-none"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={!location.trim() || !description.trim() || isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-xs shadow-md shadow-blue-600/20 active:scale-98 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Save Weakness</span>
            </button>
          </div>
        </form>
      )}

      {/* Weakness Sections: Active & Improving */}
      <div className="space-y-3">
        {activeWeaknesses.length === 0 && improvingWeaknesses.length === 0 && resolvedWeaknesses.length === 0 && (
          <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-[#1E2638] rounded-xl">
            No tracked weaknesses yet. Upload a take to have the AI Maestro detect and track points of technical/expressive friction.
          </div>
        )}

        {/* Improving Weaknesses (Steel Blue) */}
        {improvingWeaknesses.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-blue-400 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Improving Towards Mastery ({improvingWeaknesses.length})</span>
            </div>
            <div className="space-y-2">
              {improvingWeaknesses.map((w) => (
                <div
                  key={w.id}
                  className="p-3.5 rounded-xl bg-[#0B0E14] border border-blue-900/50 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950/70 text-blue-300 border border-blue-700/60">
                        {w.category}
                      </span>
                      <span className="text-xs font-semibold text-[#F0F4F8]">
                        {w.location}
                      </span>
                    </div>

                    {/* Progress to mastery badge */}
                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-blue-950/60 text-blue-300 border border-blue-800/60 font-semibold">
                      <span>{w.consecutiveCleanSessions} / 3 clean days</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300">
                    {w.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Weaknesses (Amber/Violet) */}
        {activeWeaknesses.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-amber-400 uppercase tracking-wider">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Active Issues ({activeWeaknesses.length})</span>
            </div>
            <div className="space-y-2">
              {activeWeaknesses.map((w) => (
                <div
                  key={w.id}
                  className="p-3.5 rounded-xl bg-[#0B0E14] border border-amber-900/40 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-violet-950/60 text-violet-300 border border-violet-800/60">
                        {w.category}
                      </span>
                      <span className="text-xs font-semibold text-[#F0F4F8]">
                        {w.location}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-950/60 text-amber-300 border border-amber-800/60">
                      <span>Occurrences: {w.occurrenceCount}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300">
                    {w.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resolved Weaknesses (Collapsible) */}
        {resolvedWeaknesses.length > 0 && (
          <div className="pt-2 border-t border-[#1E2638]">
            <button
              onClick={() => setShowResolved((prev) => !prev)}
              className="flex items-center justify-between w-full text-xs font-mono text-slate-400 hover:text-white transition-colors cursor-pointer py-1"
            >
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                <span>Resolved & Mastered Repertoire Points ({resolvedWeaknesses.length})</span>
              </div>
              {showResolved ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showResolved && (
              <div className="space-y-2 mt-2">
                {resolvedWeaknesses.map((w) => (
                  <div
                    key={w.id}
                    className="p-3 rounded-xl bg-[#0B0E14]/40 border border-[#1E2638] space-y-1 opacity-70"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-slate-300">
                        {w.category}
                      </span>
                      <span className="text-xs font-medium line-through text-slate-400">
                        {w.location}
                      </span>
                      <span className="text-[10px] font-mono text-blue-400 ml-auto">
                        Mastered (3+ clean sessions)
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      {w.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
