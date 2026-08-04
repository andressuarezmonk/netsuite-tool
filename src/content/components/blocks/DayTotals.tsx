import React from 'react';
import { DAYS } from '@/lib/constants';
import { formatHours } from '@/lib/dates';
import type { TotalsProps } from './types';
import gs from './index.module.scss';
import s  from './DayTotals.module.scss';

export default function DayTotals({ rows, dayDates, today }: TotalsProps) {
  const grandTotal = DAYS.reduce(
    (sum, dk) => sum + rows.reduce((rs, r) => rs + (r.days[dk]?.hours ?? 0), 0),
    0,
  );

  return (
    <tr>
      <td colSpan={2} className={gs.totalLabel}>Week total</td>
      {DAYS.map((dk, i) => {
        const total = rows.reduce((sum, r) => sum + (r.days[dk]?.hours ?? 0), 0);
        return (
          <td
            key={dk}
            className={`${gs.colDay}${dayDates[i] === today ? ` ${s.today}` : ''}`}
          >
            {total ? formatHours(total) : ''}
          </td>
        );
      })}
      <td className={gs.colTotal}>{grandTotal ? formatHours(grandTotal) : ''}</td>
      <td className={gs.colDel} />
    </tr>
  );
}
