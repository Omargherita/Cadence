import { useState, FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { CreateTaskRequest, TaskCategory, RecurrencePattern } from '../../types/cadence';
import { getTodayIsoDate } from '../../utils/date';
export function TaskEntry({onAddTask}:{onAddTask:(task:CreateTaskRequest)=>Promise<void>}) {
 const [title,setTitle]=useState(''); const [category,setCategory]=useState<TaskCategory>('DeepWork');
 const [priority,setPriority]=useState(2); const [recurrence,setRecurrence]=useState<RecurrencePattern>('None');
 const [date,setDate]=useState(getTodayIsoDate()); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
 async function submit(e:FormEvent) { e.preventDefault(); if(!title.trim()||busy)return;setBusy(true);setError('');try {await onAddTask({title:title.trim(),category,priority,recurrence,scheduledDate:date||null});setTitle('');setRecurrence('None');}catch(e){setError(e instanceof Error?e.message:'Could not add task. Try again.');}finally{setBusy(false);} }
 return <form onSubmit={submit} className="task-command"><div className="command-title"><Plus size={17}/><input aria-label="Task title" placeholder="Add a task or commitment…" maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/><button className="quiet-button" disabled={!title.trim()||busy}>{busy?'Adding…':'Add task'}</button></div><div className="command-options">
 <select aria-label="Category" value={category} onChange={e=>setCategory(e.target.value as TaskCategory)}>{['University','DeepWork','Piano','Gym','LifeAdmin'].map(value=><option key={value} value={value}>{value.replace(/([a-z])([A-Z])/g,'$1 $2')}</option>)}</select>
 <select aria-label="Priority" value={priority} onChange={e=>setPriority(Number(e.target.value))}>{[1,2,3].map(p=><option key={p} value={p}>Priority {p}</option>)}</select>
 <label className="date-control"><span className="sr-only">Scheduled date, blank for unscheduled</span><input aria-label="Scheduled date" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button type="button" onClick={()=>setDate(date?'':getTodayIsoDate())}>{date?'Clear date':'Unscheduled'}</button>
 <select aria-label="Repeat" value={recurrence} onChange={e=>setRecurrence(e.target.value as RecurrencePattern)}>{['None','Daily','Weekdays','Weekly'].map(value=><option key={value} value={value}>{value==='None'?'Once':value}</option>)}</select></div>{error&&<p role="alert" className="text-rose-300">{error}</p>}</form>;
}
