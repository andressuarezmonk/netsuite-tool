import React from 'react';
import s from './WeekNav.module.scss';

interface Props {
  weekISO: string;
  label: string;
  refreshing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export default function WeekNav({ label, onPrev, onNext, onToday }: Props) {
  return (
    <div className={s.nav}>
      <button onClick={onPrev}>◀ Prev</button>
      <span className={s.label}>{label}</span>
      <button onClick={onNext}>Next ▶</button>
      <button className={s.todayBtn} onClick={onToday}>This week</button>
    </div>
  );
}
