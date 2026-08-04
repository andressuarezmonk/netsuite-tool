import { DAYS } from "@/lib/constants";
import { formatHours } from "@/lib/dates";
import type { TotalsProps } from "../../types";

export default function DayTotals({ rows, dayDates, today }: TotalsProps) {
  const grandTotal = DAYS.reduce(
    (s, dk) => s + rows.reduce((rs, r) => rs + (r.days[dk]?.hours ?? 0), 0),
    0,
  );

  return (
    <tr>
      <td colSpan={2} className="ft-total-label">
        Week total
      </td>
      {DAYS.map((dk, i) => {
        const total = rows.reduce((s, r) => s + (r.days[dk]?.hours ?? 0), 0);
        return (
          <td
            key={dk}
            className={`ft-col-day${dayDates[i] === today ? " ft-today" : ""}`}
          >
            {total ? formatHours(total) : ""}
          </td>
        );
      })}
      <td className="ft-col-total">
        {grandTotal ? formatHours(grandTotal) : ""}
      </td>
      <td className="ft-col-del" />
    </tr>
  );
}
