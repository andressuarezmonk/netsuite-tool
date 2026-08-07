import { DAYS } from "@/lib/constants";
import { addDays, todayISO } from "@/lib/dates";
import TimeRow from "../TimeRow/TimeRow";
import DayTotals from "../DayTotals/DayTotals";
import { useAppState } from "../../../context/AppContext";
import styles from "./WeekGrid.module.scss";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function WeekGrid() {
  const { weekData, weekISO } = useAppState();
  const today = todayISO();
  const dayDates = DAYS.map((_, i) => addDays(weekISO, i));

  if (!weekData) return null;

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colProj}>Project</th>
            <th className={styles.colTask}>Task</th>
            {DAYS.map((_, i) => (
              <th
                key={DAYS[i]}
                className={`${styles.colDay}${dayDates[i] === today ? ` ${styles.today}` : ""}`}
              >
                {DAY_LABELS[i]}
                <span className={styles.dayDate}>
                  {dayDates[i].slice(5).replace("-", "/")}
                </span>
              </th>
            ))}
            <th className={styles.colTotal}>Total</th>
            <th className={styles.colDel} />
          </tr>
        </thead>
        <tbody>
          {weekData.rows.length === 0 ? (
            <tr>
              <td colSpan={DAYS.length + 3} className={styles.emptyRow}>
                No entries this week. Add a row below.
              </td>
            </tr>
          ) : (
            weekData.rows.map((row) => (
              <TimeRow
                key={row.rowKey}
                row={row}
                dayDates={dayDates}
                today={today}
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
