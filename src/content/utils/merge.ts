import type { WeekData, TimeRow, DayEntry } from "./types";
import { DAYS, type DayKey } from "./constants";

/**
 * Merges fresh server data into currently-displayed data.
 *
 * Rules:
 * - Fresh data always wins for approved entries (user can't edit those anyway)
 * - Fresh data wins for cells the user has NOT locally edited
 * - User's local edits are preserved for non-approved cells
 * - New rows from the server are added
 * - Rows that disappeared from the server are kept (user may have added them locally)
 */

/**
 * Keeps the user's locally typed hours but updates server-side metadata
 * (timeid, approval flags) from the fresh response if available.
 */
const preserveLocalEditWithFreshMetadata = (
  displayedDayEntry: DayEntry,
  freshDayEntry: DayEntry | undefined,
  localHours: number,
): DayEntry => ({
  ...displayedDayEntry,
  hours: localHours,
  timeid: freshDayEntry?.timeid ?? displayedDayEntry.timeid,
  approved: freshDayEntry?.approved ?? displayedDayEntry.approved,
  submitted: freshDayEntry?.submitted ?? displayedDayEntry.submitted,
  disabled: freshDayEntry?.disabled ?? displayedDayEntry.disabled,
});

/**
 * Produce a fresh DayEntry with updated server metadata but preserved local hours.
 * Used when the server confirms a save (we get back a timeid).
 */
export const patchDayEntry = (
  existingDayEntry: DayEntry | undefined,
  patch: Partial<DayEntry>,
): DayEntry => {
  return {
    hours: existingDayEntry?.hours ?? 0,
    memo: existingDayEntry?.memo ?? "",
    timeid: existingDayEntry?.timeid ?? "",
    approved: existingDayEntry?.approved ?? false,
    submitted: existingDayEntry?.submitted ?? false,
    disabled: existingDayEntry?.disabled ?? false,
    ...patch,
  };
};

/**
 * localEdits: a map of "projId_taskId_dayKey" -> hours the user typed locally
 * (tracked in the UI layer and passed here so we know what not to overwrite)
 */
export const mergeWeekData = (
  displayedWeekData: WeekData,
  freshWeekData: WeekData,
  localEdits: Map<string, number>,
): WeekData => {
  const freshRowsByKey = new Map(
    freshWeekData.rows.map((row) => [row.rowKey, row]),
  );

  const mergedDisplayedRows = displayedWeekData.rows.map((displayedRow) => {
    const { rowKey, projId, taskId } = displayedRow;
    const freshRow = freshRowsByKey.get(rowKey);
    const localEditKeyPrefix = `${projId}_${taskId}`;

    const mergedDays: TimeRow["days"] = {};

    DAYS.forEach((dayKey) => {
      const displayedDayEntry = displayedRow.days[dayKey as DayKey];
      const freshDayEntry = freshRow?.days[dayKey as DayKey];
      const localEditKey = `${localEditKeyPrefix}_${dayKey}`;
      const userHasLocalEditForCell = localEdits.has(localEditKey);
      const freshDataIsAvailable = freshDayEntry !== undefined;
      const displayedDataIsAvailable = displayedDayEntry !== undefined;

      if (freshDayEntry?.approved) {
        mergedDays[dayKey as DayKey] = freshDayEntry;
      } else if (userHasLocalEditForCell && displayedDataIsAvailable) {
        mergedDays[dayKey as DayKey] = preserveLocalEditWithFreshMetadata(
          displayedDayEntry,
          freshDayEntry,
          localEdits.get(localEditKey) ?? displayedDayEntry.hours,
        );
      } else if (freshDataIsAvailable) {
        mergedDays[dayKey as DayKey] = freshDayEntry;
      } else if (!freshDataIsAvailable && displayedDataIsAvailable) {
        mergedDays[dayKey as DayKey] = displayedDayEntry;
      }
      // else: row exists in fresh but this day has no entry →
      // the server considers this cell empty, so omit it
    });

    freshRowsByKey.delete(rowKey); // mark as processed so we don't add it again below
    return { ...displayedRow, days: mergedDays };
  });

  // Append new rows from the server that weren't in the displayed data
  const newServerRows = [...freshRowsByKey.values()];

  // Drop rows with no day entries (can arise from either source)
  const nonEmptyRows = [...mergedDisplayedRows, ...newServerRows].filter(
    (row) => Object.keys(row.days).length > 0,
  );

  return { ...freshWeekData, rows: nonEmptyRows };
};
