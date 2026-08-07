import React from 'react';
import { getMondayISO } from '@/lib/dates';
import s from './WeekNav.module.scss';

interface Props {
  weekISO: string;
  label: string;
  refreshing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onJump: (mondayISO: string) => void;
}

function isoToWeekValue(mondayISO: string): string {
  const d = new Date(mondayISO + 'T12:00:00');
  const year = d.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear = Math.floor((d.getTime() - startOfYear.getTime()) / 86400000) + 1;
  const weekNum = Math.ceil((dayOfYear + startOfYear.getDay()) / 7);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function weekValueToISO(weekVal: string): string {
  const [yearStr, weekStr] = weekVal.split('-W');
  const year = parseInt(yearStr);
  const week = parseInt(weekStr);
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const weekOneMonday = new Date(jan4.getTime() - (jan4Day - 1) * 86400000);
  const target = new Date(weekOneMonday.getTime() + (week - 1) * 7 * 86400000);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  return getMondayISO(`${y}-${m}-${day}`);
}

export default function WeekNav({
  weekISO, label, onPrev, onNext, onToday, onJump,
}: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    // Handle both "YYYY-WNN" (type=week) and "YYYY-MM-DD" (type=date) formats.
    // Always snap to the Monday of whichever week/day was picked.
    let mondayISO: string;
    if (val.includes('-W')) {
      mondayISO = weekValueToISO(val);
    } else {
      // type=date — user picked an arbitrary day, snap to its Monday
      mondayISO = getMondayISO(val);
    }
    onJump(mondayISO);
  };

  return (
    <div className={s.nav}>
      <button onClick={onPrev}>◀ Prev</button>

      {/*
        The week input is rendered directly — no portal, no showPicker().
        It sits inside the Shadow DOM but we style it to look like the label.
        Chrome renders <input type="week"> picker on click naturally when the
        input is visible and interactive, even inside Shadow DOM.
        The label text is shown via a <span> layered on top; the input itself
        is made transparent so only the styled span is visible, but clicks
        still hit the input's clickable area.
      */}
      <label className={s.labelWrap}>
        <input
          type="week"
          className={s.weekInput}
          value={isoToWeekValue(weekISO)}
          onChange={handleChange}
          title="Jump to a specific week"
        />
        <span className={s.labelText} aria-hidden="true">
          {label}
          <span className={s.calIcon}>📅</span>
        </span>
      </label>

      <button onClick={onNext}>Next ▶</button>
      <button className={s.todayBtn} onClick={onToday}>This week</button>
    </div>
  );
}
