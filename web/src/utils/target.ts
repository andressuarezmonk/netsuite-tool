import { DAYS, type DayKey } from "./constants";
import type { TimeRow } from "./types";

/** Days of the week the weekly target is spread across (Mon–Fri). */
const TARGET_DAYS: readonly DayKey[] = DAYS.slice(0, 5);

/** Tolerance so 7.999… vs 8 doesn't read as "under". */
const HOURS_EPSILON = 0.01;

export type DayTargetStatus = "under" | "over" | null;

export function getDailyTarget(weeklyTarget: number): number {
  return weeklyTarget / TARGET_DAYS.length;
}

export function getDayTotal(rows: TimeRow[], dayKey: DayKey): number {
  let total = 0;
  rows.forEach((row) => {
    total += row.days[dayKey]?.hours ?? 0;
  });
  return total;
}

export function getWeekTotal(rows: TimeRow[]): number {
  let total = 0;
  DAYS.forEach((dayKey) => {
    total += getDayTotal(rows, dayKey);
  });
  return total;
}

/** Number of Mon–Fri days that are holidays. */
export function countWeekdayHolidays(
  holidays: Partial<Record<DayKey, string>>,
): number {
  return TARGET_DAYS.filter((dayKey) => holidays[dayKey]).length;
}

/**
 * Compares a day's total against the daily target. Only Mon–Fri are judged.
 * Holidays count like any other day: they are logged under an "Out of Office"
 * project, so the full target still applies. "under" is reported for past days
 * only, since today and future days are still being filled in.
 */
export function getDayTargetStatus(params: {
  dayKey: DayKey;
  dayDate: string;
  today: string;
  total: number;
  dailyTarget: number;
}): DayTargetStatus {
  const { dayKey, dayDate, today, total, dailyTarget } = params;
  if (!TARGET_DAYS.includes(dayKey)) return null;
  if (total > dailyTarget + HOURS_EPSILON) return "over";
  if (dayDate < today && total < dailyTarget - HOURS_EPSILON) return "under";
  return null;
}
