import type { DayKey } from "./days";
import type { DayEntry, TimeRow } from "./types";

/**
 * All entries for one project+task on one day. NS can still return the same
 * project+task split across several rows (e.g. an approved block and a new
 * one), so every matching row is searched.
 */
export function findDayEntries(
  rows: TimeRow[],
  projId: string,
  taskId: string,
  dayKey: DayKey,
): DayEntry[] {
  return rows
    .filter((row) => row.projId === projId && row.taskId === taskId)
    .map((row) => row.days[dayKey])
    .filter((entry): entry is DayEntry => entry !== undefined);
}

/**
 * The entry that already exists as a saved NS record (has a timeid), if any.
 * Saving with that timeid makes NS update the record instead of creating a
 * duplicate.
 */
export function findSavedDayEntry(
  rows: TimeRow[],
  projId: string,
  taskId: string,
  dayKey: DayKey,
): DayEntry | undefined {
  return findDayEntries(rows, projId, taskId, dayKey).find(
    (entry) => entry.timeid !== "",
  );
}
