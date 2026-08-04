import React, { useState } from 'react';
import { DAYS } from '@/lib/constants';
import { formatHours } from '@/lib/dates';
import DayCell from './DayCell';
import type { RowProps } from '../types';
import gs from './index.module.scss';   // grid shared styles (column classes)
import s  from './TimeRow.module.scss';

export default function TimeRow({ row, dayDates, today, onSave, onDelete }: RowProps) {
  const rowTotal   = DAYS.reduce((sum, dk) => sum + (row.days[dk]?.hours ?? 0), 0);
  const [deleting, setDeleting] = useState(false);
  const hasApproved = DAYS.some(dk => row.days[dk]?.approved);

  const handleDelete = async () => {
    if (!confirm(`Remove row "${row.projName} — ${row.taskName}"? This will delete all saved time entries in this row.`)) return;
    setDeleting(true);
    try { await onDelete(row); }
    finally { setDeleting(false); }
  };

  return (
    <tr>
      <td className={gs.tdProj} title={row.projId}>{row.projName}</td>
      <td className={gs.tdTask} title={row.taskId}>{row.taskName || '—'}</td>
      {DAYS.map((dk, i) => (
        <DayCell
          key={dk}
          row={row}
          dayKey={dk}
          isToday={dayDates[i] === today}
          onSave={onSave}
        />
      ))}
      <td className={gs.tdTotal}>{rowTotal ? formatHours(rowTotal) : ''}</td>
      <td className={gs.colDel}>
        <button
          className={s.delBtn}
          onClick={handleDelete}
          disabled={deleting || hasApproved}
          title={hasApproved ? 'Cannot delete — row has approved entries' : 'Remove this row'}
        >
          {deleting ? '…' : '×'}
        </button>
      </td>
    </tr>
  );
}
