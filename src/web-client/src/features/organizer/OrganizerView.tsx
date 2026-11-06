import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { CreateTaskRequest, DayArchetype, TaskItem } from '../../types/cadence';
import { Horizon } from '../../components/Header';
import { TaskEntry } from './TaskEntry';
import { TaskItemCard } from './TaskItemCard';
import { addDaysToIsoDate, getTodayIsoDate, parseIsoDateLocal } from '../../utils/date';
interface OrganizerViewProps {
  tasks: TaskItem[]; selectedArchetype: DayArchetype; onSelectArchetype: (value: DayArchetype) => void;
  onAddTask: (task: CreateTaskRequest) => Promise<void>; onToggleTask: (id: string) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>; onRefreshTasks: () => Promise<void>; onSwitchToPiano: () => void;
  isLoading: boolean; horizon: Horizon;
}
export function OrganizerView(p: OrganizerViewProps) {
  useEffect(() => { const refresh = () => { void p.onRefreshTasks(); }; window.addEventListener('cadence-record-updated',refresh); return () => window.removeEventListener('cadence-record-updated',refresh); },[p.onRefreshTasks]);
  const today = getTodayIsoDate();
  const filtered = p.tasks.filter(task => p.horizon === 'completed' ? task.isCompleted : p.horizon === 'unscheduled' ? !task.scheduledDate && !task.isCompleted : p.horizon === 'today' ? !task.isCompleted && (!task.scheduledDate || task.scheduledDate === today) : true);
  const titles = { today:'Today', weekly:'Weekly', unscheduled:'Unscheduled', completed:'Logbook', all:'All tasks' };
  const row = (task: TaskItem) => <TaskItemCard key={task.id} task={task} onToggle={p.onToggleTask} onDelete={p.onDeleteTask} onSwitchToPiano={p.onSwitchToPiano}/>;
  const monday = addDaysToIsoDate(today, -((parseIsoDateLocal(today).getDay()+6)%7));
  return <div className="organizer-view">
    <section className="page-heading day-overview"><div><h1>{titles[p.horizon]}</h1><p>{p.horizon === 'today' ? new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}) : 'Make room for the work that matters.'}</p></div><button className="quiet-button" onClick={p.onSwitchToPiano}>Open studio</button></section>
    <TaskEntry onAddTask={p.onAddTask}/>
    <div className="section-heading"><h2>{p.horizon === 'completed' ? 'Completed commitments' : 'Commitments'}</h2><span className="secondary">{filtered.length} items</span><button className="icon-button" aria-label="Refresh tasks" disabled={p.isLoading} onClick={p.onRefreshTasks}><RefreshCw size={15} className={p.isLoading ? 'animate-spin' : ''}/></button></div>
    {p.isLoading && <p role="status" className="secondary">Loading commitments…</p>}
    {p.horizon === 'weekly' ? <div className="weekly-agenda">{Array.from({length:7},(_,i) => { const date=addDaysToIsoDate(monday,i); return <section key={date}><h3 className={date === today ? 'text-blue-300' : ''}>{parseIsoDateLocal(date).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})}</h3>{p.tasks.filter(t => t.scheduledDate === date).map(row)}{!p.tasks.some(t => t.scheduledDate === date) && <p className="empty-line">No commitments scheduled.</p>}</section>; })}<section><h3>Unscheduled</h3>{p.tasks.filter(t=>!t.scheduledDate&&!t.isCompleted).map(row)}</section></div>
    : filtered.length ? <div className="ledger">{filtered.map(row)}</div> : <div className="empty-state"><h3>{p.horizon === 'completed' ? 'Your logbook starts here' : 'A little space in your day'}</h3><p>{p.horizon === 'completed' ? 'Completed tasks will appear here.' : 'Add a commitment above when you’re ready.'}</p></div>}
  </div>;
}
