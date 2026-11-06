import { RecordEditor } from '../../components/RecordEditor';
import { FC } from 'react';
import { Check, Trash2, ChevronRight, Music, Clock, Repeat } from 'lucide-react';
import { TaskCategory, TaskItem } from '../../types/cadence';
import { formatRelativeTime } from '../../utils/date';

interface TaskItemCardProps {
  task: TaskItem;
  onToggle: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSwitchToPiano: () => void;
}

const CATEGORY_STYLES: Record<TaskCategory, { label: string; badge: string }> = {
  University: { label: 'University', badge: 'text-blue-400 bg-blue-950/40 border-blue-800/50' },
  DeepWork: { label: 'Deep Work', badge: 'text-violet-300 bg-violet-950/40 border-violet-800/50' },
  Piano: { label: 'Piano', badge: 'text-indigo-300 bg-indigo-950/40 border-indigo-800/50' },
  Gym: { label: 'Gym', badge: 'text-amber-300 bg-amber-950/40 border-amber-800/50' },
  LifeAdmin: { label: 'Life Admin', badge: 'text-slate-300 bg-slate-800/50 border-slate-700/60' },
};

const PRIORITY_BADGES: Record<number, { label: string; badge: string }> = {
  1: { label: 'P1', badge: 'text-amber-400 bg-amber-950/40 border-amber-800/60 font-bold' },
  2: { label: 'P2', badge: 'text-blue-400 bg-blue-950/40 border-blue-800/60 font-medium' },
  3: { label: 'P3', badge: 'text-slate-400 bg-slate-800/40 border-slate-700/60 font-normal' },
};

export const TaskItemCard: FC<TaskItemCardProps> = ({
  task,
  onToggle,
  onDelete,
  onSwitchToPiano,
}) => {
  const cat = CATEGORY_STYLES[task.category] || CATEGORY_STYLES.LifeAdmin;
  const prio = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES[2];

  return (
    <div
      className={`task-row ${task.isCompleted ? 'is-completed' : ''}`}
    >
      {/* Left: Checkbox & Title */}
      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
        {/* Toggle Checkbox: Steel blue accent */}
        <button
          type="button"
          onClick={() => onToggle(task.id)}
          className={`flex items-center justify-center w-5 h-5 rounded-md border mt-0.5 sm:mt-0 transition-all cursor-pointer shrink-0 ${
            task.isCompleted
              ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
              : 'bg-[#0B0E14] border-slate-700 hover:border-blue-500 text-transparent'
          }`}
          title={task.isCompleted ? 'Mark incomplete' : 'Mark complete'}
        >
          <Check className="w-3.5 h-3.5 stroke-[3]" />
        </button>

        {/* Task Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-medium transition-all break-words ${
                task.isCompleted
                  ? 'line-through text-slate-500'
                  : 'text-[#F0F4F8]'
              }`}
            >
              {task.title}
              <RecordEditor endpoint={`/api/tasks/${task.id}`} value={task} allowDelete={false}
                fields={[{ key: 'title', label: 'Title' }, { key: 'priority', label: 'Priority (1–3)', type: 'number' },
                  { key: 'scheduledDate', label: 'Scheduled date', type: 'date' },
                  { key: 'category', label: 'Category', options: Object.keys(CATEGORY_STYLES) },
                  { key: 'recurrence', label: 'Recurrence', options: ['None', 'Daily', 'Weekdays', 'Weekly'] }]}
                onSaved={async () => { window.dispatchEvent(new Event('cadence-record-updated')); }} />
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
            {/* Category Badge */}
            <span
              className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${cat.badge}`}
            >
              {cat.label}
            </span>

            {/* Priority Badge */}
            <span
              className={`px-1.5 py-0.5 rounded-md border text-[10px] font-mono ${prio.badge}`}
            >
              {prio.label}
            </span>

            {/* Recurrence Badge */}
            {task.recurrence && task.recurrence !== 'None' && (
              <span className="px-1.5 py-0.5 rounded-md border text-[10px] font-mono text-violet-300 bg-violet-950/40 border-violet-800/60 flex items-center gap-1">
                <Repeat className="w-2.5 h-2.5 text-violet-400" />
                <span>{task.recurrence}</span>
              </span>
            )}

            {/* Schedule/Completion Info */}
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              {task.isCompleted && task.completedAtUtc
                ? `Done ${formatRelativeTime(task.completedAtUtc)}`
                : task.scheduledDate
                ? task.scheduledDate
                : 'Unscheduled'}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#1E2638]/50">
        {/* Bridge to Piano Workspace for Piano Tasks */}
        {task.category === 'Piano' && !task.isCompleted && (
          <button
            onClick={onSwitchToPiano}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-800/80 transition-all cursor-pointer shadow-sm active:scale-95"
            title="Launch Piano Workspace"
          >
            <Music className="w-3.5 h-3.5 text-indigo-400" />
            <span>Practice</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Delete Button */}
        <button
          onClick={() => onDelete(task.id)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-[#1A202C] transition-colors cursor-pointer"
          title="Delete task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
