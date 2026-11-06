import { FC, useState } from 'react';
import { CreateTaskRequest, DayArchetype, TaskItem } from '../../types/cadence';
import { DayArchetypeBanner } from './DayArchetypeBanner';
import { TaskEntry } from './TaskEntry';
import { TaskItemCard } from './TaskItemCard';
import {
  CalendarDays,
  CalendarRange,
  Check,
  CheckCircle2,
  Clock,
  Music,
  RefreshCw,
  Repeat,
  Trash2,
} from 'lucide-react';
import { addDaysToIsoDate, getTodayIsoDate, parseIsoDateLocal } from '../../utils/date';

interface OrganizerViewProps {
  tasks: TaskItem[];
  selectedArchetype: DayArchetype;
  onSelectArchetype: (archetype: DayArchetype) => void;
  onAddTask: (task: CreateTaskRequest) => Promise<void>;
  onToggleTask: (id: string) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  onRefreshTasks: () => Promise<void>;
  onSwitchToPiano: () => void;
  isLoading: boolean;
}

export const OrganizerView: FC<OrganizerViewProps> = ({
  tasks,
  selectedArchetype,
  onSelectArchetype,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onRefreshTasks,
  onSwitchToPiano,
  isLoading,
}) => {
  const [layoutMode, setLayoutMode] = useState<'daily' | 'weekly'>('daily');
  const [filterMode, setFilterMode] = useState<'today' | 'all' | 'completed'>('today');
  const todayStr = getTodayIsoDate();

  const filteredTasks = tasks.filter((t) => {
    if (filterMode === 'completed') return t.isCompleted;
    if (filterMode === 'today') {
      return t.scheduledDate === null || t.scheduledDate === todayStr;
    }
    return true; // 'all'
  });

  const incompleteCount = tasks.filter((t) => !t.isCompleted).length;
  const completedCount = tasks.filter((t) => t.isCompleted).length;

  // Build the 7 days of the current week (Monday through Sunday) in the user's local calendar
  const getWeekDates = () => {
    const dayOfWeek = parseIsoDateLocal(todayStr).getDay(); // 0 is Sunday, 1 is Monday...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayIso = addDaysToIsoDate(todayStr, diffToMonday);

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const days = [];

    for (let i = 0; i < 7; i++) {
      const iso = addDaysToIsoDate(mondayIso, i);
      const shortDate = parseIsoDateLocal(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      days.push({
        iso,
        dayName: dayNames[i],
        shortDate,
        isToday: iso === todayStr,
      });
    }
    return days;
  };

  const weekDays = getWeekDates();
  const unscheduledTasks = tasks.filter((t) => !t.scheduledDate && !t.isCompleted);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Day Archetype Banner */}
      <DayArchetypeBanner
        selectedArchetype={selectedArchetype}
        onSelectArchetype={onSelectArchetype}
        onSwitchToPiano={onSwitchToPiano}
      />

      {/* 2. Quick Task Entry */}
      <TaskEntry onAddTask={onAddTask} />

      {/* 3. View Switcher & Commitments Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-[#F0F4F8] tracking-tight">
              Action Commitments
            </h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[#111622] text-slate-400 border border-[#1E2638]">
              {incompleteCount} active / {completedCount} done
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle: Day vs Weekly Overview */}
            <div className="flex items-center bg-[#111622] p-1 rounded-xl border border-[#1E2638] text-xs">
              <button
                type="button"
                onClick={() => setLayoutMode('daily')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  layoutMode === 'daily'
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Day View</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('weekly')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  layoutMode === 'weekly'
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5" />
                <span>Weekly Overview</span>
              </button>
            </div>

            {/* Daily Filter Pills (Only visible in daily mode) */}
            {layoutMode === 'daily' && (
              <div className="flex items-center bg-[#111622] p-1 rounded-xl border border-[#1E2638] text-xs">
                <button
                  type="button"
                  onClick={() => setFilterMode('today')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                    filterMode === 'today'
                      ? 'bg-violet-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Today & Unscheduled
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                    filterMode === 'all'
                      ? 'bg-violet-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('completed')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                    filterMode === 'completed'
                      ? 'bg-violet-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Done
                </button>
              </div>
            )}

            {/* Refresh */}
            <button
              type="button"
              onClick={onRefreshTasks}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-[#111622] border border-[#1E2638] hover:bg-[#1A202C] transition-all cursor-pointer"
              title="Refresh task list"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* 4A. Day View Content */}
        {layoutMode === 'daily' && (
          <>
            {filteredTasks.length > 0 ? (
              <div className="space-y-2">
                {filteredTasks.map((task) => (
                  <TaskItemCard
                    key={task.id}
                    task={task}
                    onToggle={onToggleTask}
                    onDelete={onDeleteTask}
                    onSwitchToPiano={onSwitchToPiano}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-[#111622]/40 border border-[#1E2638] p-8 text-center space-y-2">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-800/60 text-slate-400 mb-1">
                  <CheckCircle2 className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-sm font-medium text-[#F0F4F8]">
                  {filterMode === 'completed'
                    ? 'No completed tasks yet.'
                    : 'No pending tasks for this view.'}
                </p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {filterMode === 'completed'
                    ? 'Finish your commitments to see them logged here.'
                    : 'Use the quick entry above to plan your day with minimal friction.'}
                </p>
              </div>
            )}
          </>
        )}

        {/* 4B. Weekly Overview Grid */}
        {layoutMode === 'weekly' && (
          <div className="space-y-6">
            {/* 7-Day Columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {weekDays.map((day) => {
                const dayTasks = tasks.filter((t) => t.scheduledDate === day.iso);
                const dayDoneCount = dayTasks.filter((t) => t.isCompleted).length;

                return (
                  <div
                    key={day.iso}
                    className={`rounded-2xl border p-3 flex flex-col min-h-[220px] transition-all ${
                      day.isToday
                        ? 'bg-[#141A29] border-blue-500/80 shadow-lg shadow-blue-900/20 ring-1 ring-blue-500/40'
                        : 'bg-[#111622] border-[#1E2638]'
                    }`}
                  >
                    {/* Day Header */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1E2638]">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs font-mono font-bold uppercase tracking-wider ${
                              day.isToday ? 'text-blue-400' : 'text-slate-400'
                            }`}
                          >
                            {day.dayName}
                          </span>
                          {day.isToday && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-600 text-white font-mono">
                              TODAY
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-[#F0F4F8]">
                          {day.shortDate}
                        </span>
                      </div>

                      <span className="text-[11px] font-mono text-slate-400">
                        {dayTasks.length > 0 ? `${dayDoneCount}/${dayTasks.length}` : '—'}
                      </span>
                    </div>

                    {/* Tasks for the Day */}
                    <div className="space-y-1.5 flex-1 overflow-y-auto">
                      {dayTasks.length > 0 ? (
                        dayTasks.map((t) => (
                          <div
                            key={t.id}
                            className={`p-2 rounded-xl border text-xs transition-all ${
                              t.isCompleted
                                ? 'bg-[#0B0E14]/70 border-[#1E2638]/50 opacity-60'
                                : 'bg-[#0B0E14] border-[#1E2638] hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start gap-1.5">
                              <button
                                type="button"
                                onClick={() => onToggleTask(t.id)}
                                className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border transition-all cursor-pointer ${
                                  t.isCompleted
                                    ? 'bg-blue-600 border-blue-500 text-white'
                                    : 'bg-[#111622] border-slate-700 hover:border-blue-500 text-transparent'
                                }`}
                              >
                                <Check className="w-3 h-3 stroke-[3]" />
                              </button>

                              <div className="min-w-0 flex-1">
                                <span
                                  className={`block text-[11px] leading-tight break-words ${
                                    t.isCompleted
                                      ? 'line-through text-slate-500'
                                      : 'text-[#F0F4F8] font-medium'
                                  }`}
                                >
                                  {t.title}
                                </span>

                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                  {t.recurrence && t.recurrence !== 'None' && (
                                    <span className="text-[9px] font-mono text-violet-300 flex items-center gap-0.5">
                                      <Repeat className="w-2.5 h-2.5 text-violet-400" />
                                      <span>{t.recurrence}</span>
                                    </span>
                                  )}
                                  {t.category === 'Piano' && !t.isCompleted && (
                                    <button
                                      type="button"
                                      onClick={onSwitchToPiano}
                                      className="text-[9px] font-mono text-indigo-300 hover:text-indigo-200 flex items-center gap-0.5 cursor-pointer"
                                      title="Open Piano Workspace"
                                    >
                                      <Music className="w-2.5 h-2.5 text-indigo-400" />
                                      <span>Practice</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => onDeleteTask(t.id)}
                                className="text-slate-500 hover:text-amber-400 p-0.5 rounded cursor-pointer"
                                title="Delete task"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="h-full flex items-center justify-center text-center py-6">
                          <span className="text-[11px] font-mono text-slate-400">
                            No commitments
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Unscheduled Backlog Strip */}
            {unscheduledTasks.length > 0 && (
              <div className="rounded-2xl bg-[#111622] border border-[#1E2638] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                      Unscheduled Backlog ({unscheduledTasks.length})
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Commitments without fixed date
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {unscheduledTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-xl bg-[#0B0E14] border border-[#1E2638] flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => onToggleTask(t.id)}
                          className="w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border bg-[#111622] border-slate-700 hover:border-blue-500 text-transparent cursor-pointer"
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </button>
                        <div className="min-w-0">
                          <span className="text-[12px] text-[#F0F4F8] font-medium break-words block">
                            {t.title}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {t.category}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onDeleteTask(t.id)}
                        className="text-slate-500 hover:text-amber-400 p-0.5 cursor-pointer"
                        title="Delete task"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
