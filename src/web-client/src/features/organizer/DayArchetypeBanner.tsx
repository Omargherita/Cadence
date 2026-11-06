import { FC } from 'react';
import { Music } from 'lucide-react';
import { DAY_ARCHETYPES, DayArchetype } from '../../types/cadence';

interface DayArchetypeBannerProps {
  selectedArchetype: DayArchetype;
  onSelectArchetype: (archetype: DayArchetype) => void;
  onSwitchToPiano: () => void;
}

export const DayArchetypeBanner: FC<DayArchetypeBannerProps> = ({
  selectedArchetype,
  onSwitchToPiano,
}) => {
  const current =
    DAY_ARCHETYPES.find((a) => a.type === selectedArchetype) || DAY_ARCHETYPES[0];

  const todayFormatted = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return <section className="page-heading day-overview">
    <div><h1>Today</h1><p>{todayFormatted}. {current.description}</p></div>
    <button className="quiet-button" onClick={onSwitchToPiano}><Music size={16}/>Open studio</button>
  </section>;
};
