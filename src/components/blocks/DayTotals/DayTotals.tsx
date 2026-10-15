import { DAYS, type DayKey } from "@/utils/constants";
import { formatHours } from "@/utils/dates";
import { getDayTargetStatus, getDayTotal, getWeekTotal } from "@/utils/target";
import gs from "../WeekGrid/WeekGrid.module.scss"; // shared grid column classes
import s from "./DayTotals.module.scss";
import type { TimeRow } from "@/utils/types";

export interface TotalsProps {
  rows: TimeRow[];
  dayDates: string[];
  today: string;
  holidays: Partial<Record<DayKey, string>>;
  dailyTarget: number;
}

export default function DayTotals({
  rows,
  dayDates,
  today,
  holidays,
  dailyTarget,
}: TotalsProps) {
  // A day has entries if at least one row has a DayEntry object for it
  const dayHasEntries = (dk: DayKey) =>
    rows.some((r) => r.days[dk] !== undefined);

  const hasAnyEntry = DAYS.some(dayHasEntries);

  const grandTotal = getWeekTotal(rows);

  return (
    <tr>
      <td colSpan={2} className={gs.totalLabel}>
        Week total
      </td>
      {DAYS.map((dk, i) => {
        const total = getDayTotal(rows, dk);
        const hasEntries = dayHasEntries(dk);
        const targetStatus = getDayTargetStatus({
          dayKey: dk,
          dayDate: dayDates[i],
          today,
          total,
          dailyTarget,
        });
        const classNames = [
          gs.colDay,
          dayDates[i] === today ? s.today : "",
          holidays[dk] ? s.holiday : "",
          targetStatus === "under" ? s.under : "",
          targetStatus === "over" ? s.over : "",
        ].filter(Boolean);
        return (
          <td
            key={dk}
            className={classNames.join(" ")}
            title={
              targetStatus
                ? `${targetStatus === "under" ? "Under" : "Over"} the daily target of ${formatHours(dailyTarget)}h`
                : undefined
            }
          >
            {hasEntries || targetStatus === "under" ? formatHours(total) : ""}
          </td>
        );
      })}
      <td className={gs.colTotal}>
        {hasAnyEntry ? formatHours(grandTotal) : ""}
      </td>
      <td className={gs.colDel} />
    </tr>
  );
}
