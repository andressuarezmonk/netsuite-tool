import { DAYS } from '@/lib/constants';
import { formatHours } from '@/lib/dates';
import type { TotalsProps } from '../../types';
import gs from '../WeekGrid/WeekGrid.module.scss'; // shared grid column classes
import s  from './DayTotals.module.scss';

export default function DayTotals({ rows, dayDates, today }: TotalsProps) {
  // A day has entries if at least one row has a DayEntry object for it
  const dayHasEntries = (dk: typeof DAYS[number]) =>
    rows.some(r => r.days[dk] !== undefined);

  const hasAnyEntry = DAYS.some(dayHasEntries);

  const grandTotal = DAYS.reduce(
    (sum, dk) => sum + rows.reduce((rs, r) => rs + (r.days[dk]?.hours ?? 0), 0),
    0,
  );

  return (
    <tr>
      <td colSpan={2} className={gs.totalLabel}>Week total</td>
      {DAYS.map((dk, i) => {
        const total = rows.reduce((sum, r) => sum + (r.days[dk]?.hours ?? 0), 0);
        const hasEntries = dayHasEntries(dk);
        return (
          <td
            key={dk}
            className={`${gs.colDay}${dayDates[i] === today ? ` ${s.today}` : ''}`}
          >
            {hasEntries ? formatHours(total) : ''}
          </td>
        );
      })}
      <td className={gs.colTotal}>
        {hasAnyEntry ? formatHours(grandTotal) : ''}
      </td>
      <td className={gs.colDel} />
    </tr>
  );
}
