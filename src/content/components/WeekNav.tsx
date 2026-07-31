import React from 'react';

interface Props {
  weekISO: string;
  label: string;
  refreshing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export default function WeekNav({ label, refreshing, onPrev, onNext, onToday }: Props) {
  return (
    <div className="ft-week-nav">
      <button onClick={onPrev}>◀ Prev</button>
      <span className="ft-week-label">
        {label}
        {refreshing && (
          <span className="ft-refreshing-badge" title="Refreshing from server…">
            <span className="ft-spinner ft-spinner--sm" />
          </span>
        )}
      </span>
      <button onClick={onNext}>Next ▶</button>
      <button className="ft-btn-today" onClick={onToday}>This week</button>
    </div>
  );
}
