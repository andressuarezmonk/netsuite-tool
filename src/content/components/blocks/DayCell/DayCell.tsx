import { useEffect, useRef, useState } from 'react';
import { formatHours } from '@/lib/dates';
import type { CellProps } from '../../types';
import s from './DayCell.module.scss';

export default function DayCell({ row, dayKey, isToday, onSave }: CellProps) {
  const entry = row.days[dayKey];
  const [value, setValue]   = useState(entry?.hours != null ? formatHours(entry.hours) : '');
  const [saving, setSaving] = useState(false);
  const prevRef = useRef(value);

  const freshVal = entry?.hours != null ? formatHours(entry.hours) : '';
  useEffect(() => {
    if (freshVal !== prevRef.current && !saving) {
      setValue(freshVal);
      prevRef.current = freshVal;
    }
  }, [freshVal, saving]);

  const disabled = entry?.approved || entry?.submitted || entry?.disabled || false;

  const handleBlur = async () => {
    if (value === prevRef.current) return;

    let hours = 0;
    if (value.trim()) {
      const colonMatch = value.match(/^(\d+):(\d{2})$/);
      if (colonMatch) {
        hours = parseInt(colonMatch[1]) + parseInt(colonMatch[2]) / 60;
      } else {
        hours = parseFloat(value.replace(/[^\d.]/g, ''));
      }
      if (isNaN(hours) || hours < 0) { setValue(prevRef.current); return; }
    }

    setSaving(true);
    try {
      await onSave(row, dayKey, hours, entry?.memo ?? '');
      const newVal = hours != null ? formatHours(hours) : '';
      setValue(newVal);
      prevRef.current = newVal;
    } catch {
      setValue(prevRef.current);
    } finally {
      setSaving(false);
    }
  };

  const cellClass = [s.cell, isToday ? s.today : ''].filter(Boolean).join(' ');

  const inputClass = [
    s.input,
    entry?.approved  ? s.inputApproved  : '',
    entry?.submitted ? s.inputSubmitted : '',
    !disabled && entry?.hours != null ? s.inputHasValue : '',
    saving ? s.inputSaving : '',
  ].filter(Boolean).join(' ');

  return (
    <td className={cellClass}>
      <input
        type="text"
        className={inputClass}
        value={value}
        onChange={e => setValue(e.target.value)}
        onFocus={() => { prevRef.current = value; }}
        onBlur={handleBlur}
        readOnly={disabled}
        title={
          entry?.approved  ? 'Approved — cannot edit' :
          entry?.submitted ? 'Submitted — pending approval' :
          undefined
        }
      />
    </td>
  );
}
