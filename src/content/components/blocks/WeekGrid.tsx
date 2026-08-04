import { DAYS } from "@/lib/constants";
import { addDays, todayISO } from "@/lib/dates";
import type { WeekData } from "@/lib/types";
import TimeRow from "./TimeRow";
import DayTotals from "../atoms/DayTotals";
import type { OnSave, OnDelete } from "../types";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  weekData: WeekData | null;
  weekISO: string;
  onSave: OnSave;
  onDelete: OnDelete;
}

export default function WeekGrid({
  weekData,
  weekISO,
  onSave,
  onDelete,
}: Props) {
  const today = todayISO();
  const dayDates = DAYS.map((_, i) => addDays(weekISO, i));

  if (!weekData) return null;

  return (
    <div className="ft-grid-wrap">
      <table className="ft-table">
        <thead>
          <tr>
            <th className="ft-col-proj">Project</th>
            <th className="ft-col-task">Task</th>
            {DAYS.map((_, i) => (
              <th
                key={DAYS[i]}
                className={`ft-col-day${dayDates[i] === today ? " ft-today" : ""}`}
              >
                {DAY_LABELS[i]}
                <span className="ft-day-date">
                  {dayDates[i].slice(5).replace("-", "/")}
                </span>
              </th>
            ))}
            <th className="ft-col-total">Total</th>
            <th className="ft-col-del" />
          </tr>
        </thead>
        <tbody>
          {weekData.rows.length === 0 ? (
            <tr>
              <td colSpan={DAYS.length + 3} className="ft-empty-row">
                No entries this week. Add a row below.
              </td>
            </tr>
          ) : (
            weekData.rows.map((row) => (
              <TimeRow
                key={`${row.projId}_${row.taskId}`}
                row={row}
                dayDates={dayDates}
                today={today}
                onSave={onSave}
                onDelete={onDelete}
              />
            ))
          )}
        </tbody>
        <tfoot>
          <DayTotals rows={weekData.rows} dayDates={dayDates} today={today} />
        </tfoot>
      </table>
    </div>
  );
}
