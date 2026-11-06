import { StatusGlyph } from '../../components/StatusGlyph';
import React, { FC, useState } from 'react';

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

  return <section className="focus-ledger">
    <div className="section-heading"><h2>Technical focus</h2><span className="secondary">{activeWeaknesses.length + improvingWeaknesses.length} in progress</span><button className="quiet-button ml-auto" onClick={()=>setIsAddFormOpen(!isAddFormOpen)}>{isAddFormOpen?'Cancel':'Add focus'}</button></div>
    <p className="secondary text-xs py-3">Mastery grows over three clean practice days.</p>
    {isAddFormOpen&&<form onSubmit={handleSubmit} className="focus-form space-y-3">
      <label>Category<select value={category} onChange={e=>setCategory(e.target.value as WeaknessCategory)}>{CATEGORY_OPTIONS.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
      <label>Location<input value={location} onChange={e=>setLocation(e.target.value)} required maxLength={200} placeholder="Measures 208–220"/></label>
      <label>What needs attention?<textarea value={description} onChange={e=>setDescription(e.target.value)} required rows={2}/></label>
      <button className="quiet-button" disabled={isSubmitting}>{isSubmitting?'Saving…':'Add focus'}</button>
    </form>}
    {[...improvingWeaknesses,...activeWeaknesses,...(showResolved?resolvedWeaknesses:[])].map(w=><div key={w.id} className="focus-row">
      <StatusGlyph label={w.status} progress={w.status==='Resolved'?1:w.consecutiveCleanSessions/3} tone={w.status==='Resolved'?'blue':'amber'}/>
      <div><span className="measure-token">{w.location}</span><span className="secondary ml-3 text-xs">{CATEGORY_OPTIONS.find(c=>c.value===w.category)?.label || w.category}</span><p>{w.description}</p></div>
      <span className="focus-count">{w.status==='Active'?`${w.occurrenceCount} occurrences`:`${w.consecutiveCleanSessions}/3 clean days`}</span>
    </div>)}
    {!activeWeaknesses.length&&!improvingWeaknesses.length&&<p className="empty-line">No active focus areas. Add one or analyze a practice take.</p>}
    {resolvedWeaknesses.length>0&&<button className="quiet-button mt-3" onClick={()=>setShowResolved(!showResolved)}>{showResolved?'Hide':'Show'} mastered areas ({resolvedWeaknesses.length})</button>}
  </section>;
};
