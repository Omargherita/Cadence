import React, { FC, useState } from 'react';
import { Plus, Calendar as CalendarIcon, Tag, Flame, Repeat } from 'lucide-react';
import { CreateTaskRequest, RecurrencePattern, TaskCategory } from '../../types/cadence';
import { getTodayIsoDate } from '../../utils/date';

interface TaskEntryProps {
  onAddTask: (task: CreateTaskRequest) => Promise<void>;
}

const CATEGORIES: { value: TaskCategory; label: string; color: string }[] = [
  { value: 'University', label: 'University', color: 'text-blue-400 bg-blue-950/40 border-blue-800/50' },
  { value: 'DeepWork', label: 'Deep Work', color: 'text-violet-300 bg-violet-950/40 border-violet-800/50' },
  { value: 'Piano', label: 'Piano', color: 'text-indigo-300 bg-indigo-950/40 border-indigo-800/50' },
  { value: 'Gym', label: 'Gym', color: 'text-amber-300 bg-amber-950/40 border-amber-800/50' },
  { value: 'LifeAdmin', label: 'Life Admin', color: 'text-slate-300 bg-slate-800/50 border-slate-700/60' },
];

const PRIORITIES = [
  { value: 1, label: 'P1 High', color: 'text-amber-400 border-amber-800/60 bg-amber-950/40' },
  { value: 2, label: 'P2 Med', color: 'text-blue-400 border-blue-800/60 bg-blue-950/40' },
  { value: 3, label: 'P3 Low', color: 'text-slate-400 border-slate-700/60 bg-slate-800/40' },
];

const RECURRENCE_OPTIONS: { value: RecurrencePattern; label: string }[] = [
  { value: 'None', label: 'Once' },
  { value: 'Daily', label: 'Daily' },
  { value: 'Weekdays', label: 'Weekdays' },
  { value: 'Weekly', label: 'Weekly' },
];

export const TaskEntry: FC<TaskEntryProps> = ({ onAddTask }) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TaskCategory>('DeepWork');
  const [priority, setPriority] = useState<number>(2);
  const [recurrence, setRecurrence] = useState<RecurrencePattern>('None');
  const [isScheduledForToday, setIsScheduledForToday] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onAddTask({
        title: title.trim(),
        category,
        priority,
        recurrence,
        scheduledDate: isScheduledForToday ? getTodayIsoDate() : null,
      });
      setTitle('');
      setRecurrence('None');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl bg-[#111622] border border-[#1E2638] p-4 sm:p-5 shadow-lg shadow-black/20 space-y-3"
    >
      {/* Primary Input Line */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Capture task or commitment... (Press Enter to save)"
            maxLength={200}
            className="w-full bg-[#0B0E14] border border-[#1E2638] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-3 text-sm text-[#F0F4F8] placeholder-slate-500 outline-none transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={!title.trim() || isSubmitting}
          className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white font-semibold text-sm transition-all shadow-md shadow-blue-600/20 active:scale-95 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Task</span>
        </button>
      </div>

      {/* Fast Selectors Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 text-slate-400 font-mono text-[11px] mr-1">
            <Tag className="w-3 h-3 text-slate-400" />
            <span>Category:</span>
          </div>
          {CATEGORIES.map((c) => {
            const isSelected = category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`px-2.5 py-1 rounded-lg border font-medium transition-all cursor-pointer ${
                  isSelected
                    ? `${c.color} font-semibold ring-1 ring-white/20`
                    : 'bg-[#0B0E14] text-slate-400 border-[#1E2638] hover:bg-[#1A202C] hover:text-slate-300'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Priority, Recurrence & Date Quick Toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Priority */}
          <div className="flex items-center gap-1">
            <Flame className="w-3 h-3 text-amber-400" />
            <div className="flex items-center gap-1">
              {PRIORITIES.map((p) => {
                const isSelected = priority === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`px-2 py-0.5 rounded-md border text-[11px] font-mono font-medium transition-all cursor-pointer ${
                      isSelected
                        ? `${p.color} font-bold ring-1 ring-white/20`
                        : 'bg-[#0B0E14] text-slate-400 border-[#1E2638] hover:bg-[#1A202C]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recurrence */}
          <div className="flex items-center gap-1">
            <Repeat className="w-3 h-3 text-violet-400" />
            <div className="flex items-center gap-1">
              {RECURRENCE_OPTIONS.map((r) => {
                const isSelected = recurrence === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRecurrence(r.value)}
                    className={`px-2 py-0.5 rounded-md border text-[11px] font-mono font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-violet-950/60 text-violet-300 border-violet-800/80 font-bold ring-1 ring-violet-500/30'
                        : 'bg-[#0B0E14] text-slate-400 border-[#1E2638] hover:bg-[#1A202C]'
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Schedule Date Toggle */}
          <button
            type="button"
            onClick={() => setIsScheduledForToday((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all cursor-pointer ${
              isScheduledForToday
                ? 'bg-blue-950/40 text-blue-400 border-blue-800/60 font-medium'
                : 'bg-[#0B0E14] text-slate-400 border-[#1E2638] hover:bg-[#1A202C]'
            }`}
          >
            <CalendarIcon className="w-3 h-3" />
            <span>{isScheduledForToday ? 'Scheduled for Today' : 'Unscheduled'}</span>
          </button>
        </div>
      </div>
    </form>
  );
};
