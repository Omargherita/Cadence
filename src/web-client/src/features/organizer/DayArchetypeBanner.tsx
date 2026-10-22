import { FC } from 'react';
import { Calendar, ChevronRight, Music, Sparkles } from 'lucide-react';
import { DAY_ARCHETYPES, DayArchetype } from '../../types/cadence';

interface DayArchetypeBannerProps {
  selectedArchetype: DayArchetype;
  onSelectArchetype: (archetype: DayArchetype) => void;
  onSwitchToPiano: () => void;
}

export const DayArchetypeBanner: FC<DayArchetypeBannerProps> = ({
  selectedArchetype,
  onSelectArchetype,
  onSwitchToPiano,
}) => {
  const current =
    DAY_ARCHETYPES.find((a) => a.type === selectedArchetype) || DAY_ARCHETYPES[0];

  const todayFormatted = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#111622] via-[#141A29] to-[#111622] border border-[#1E2638] p-5 sm:p-6 shadow-xl shadow-black/40">
      {/* Decorative gradient glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 -mb-16 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        {/* Left: Today's Date & Current Archetype Summary */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono font-medium text-slate-400">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span>{todayFormatted}</span>
            <span className="text-slate-600">•</span>
            <span className="text-blue-400 font-semibold uppercase tracking-wider">
              Today's Archetype
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#F0F4F8]">
              {current.label}
            </h2>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-violet-950/60 text-violet-300 border border-violet-800/60">
              <Sparkles className="w-3 h-3 text-violet-400" />
              <span>{current.pianoTarget}</span>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-400 max-w-xl">
            {current.description}
          </p>
        </div>

        {/* Right: Bridge to Piano Workspace Button */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onSwitchToPiano}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-lg shadow-blue-600/20 active:scale-98 transition-all cursor-pointer"
          >
            <Music className="w-4 h-4" />
            <span>Start Practice Session</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Archetype Quick Switcher Bar */}
      <div className="mt-5 pt-4 border-t border-[#1E2638]/70 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mr-1">
          Structure:
        </span>
        {DAY_ARCHETYPES.map((arch) => {
          const isSelected = arch.type === selectedArchetype;
          return (
            <button
              key={arch.type}
              onClick={() => onSelectArchetype(arch.type)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'bg-[#0B0E14] text-slate-400 hover:text-[#F0F4F8] hover:bg-[#1A202C] border border-[#1E2638]'
              }`}
            >
              {arch.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
