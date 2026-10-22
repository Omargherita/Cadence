import { FC, useState } from 'react';
import { CreateTaskRequest, DayArchetype, TaskItem } from '../../types/cadence';
import { DayArchetypeBanner } from './DayArchetypeBanner';
import { TaskEntry } from './TaskEntry';
import { TaskItemCard } from './TaskItemCard';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { getTodayIsoDate } from '../../utils/date';

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

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* 1. Day Archetype Banner */}
      <DayArchetypeBanner
        selectedArchetype={selectedArchetype}
        onSelectArchetype={onSelectArchetype}
        onSwitchToPiano={onSwitchToPiano}
      />

      {/* 2. Quick Task Entry */}
      <TaskEntry onAddTask={onAddTask} />

      {/* 3. Task List Header & Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[#F0F4F8] tracking-tight">
              Action Commitments
            </h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[#111622] text-slate-400 border border-[#1E2638]">
              {incompleteCount} active / {completedCount} done
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Pills */}
            <div className="flex items-center bg-[#111622] p-1 rounded-xl border border-[#1E2638] text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('today')}
                className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  filterMode === 'today'
                    ? 'bg-blue-600 text-white font-semibold'
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
                    ? 'bg-blue-600 text-white font-semibold'
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
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Done
              </button>
            </div>

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

        {/* Task Cards List */}
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
      </div>
    </div>
  );
};
