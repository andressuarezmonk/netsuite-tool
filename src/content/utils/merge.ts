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

import type { WeekData, TimeRow, DayEntry } from "./types";
import { DAYS, type DayKey } from "./constants";

/**
 * localEdits: a map of "projId_taskId_dayKey" -> hours the user typed locally
 * (tracked in the UI layer and passed here so we know what not to overwrite)
 */
export function mergeWeekData(
  displayedWeekData: WeekData,
  freshWeekData: WeekData,
  localEdits: Map<string, number>,
): WeekData {
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

      if (freshDayEntry?.approved) {
        // Approved on server → always take fresh value, any local edit is irrelevant
        mergedDays[dayKey as DayKey] = freshDayEntry;
      } else if (userHasLocalEditForCell && displayedDayEntry) {
        // User made a local edit to this cell → preserve their hours,
        // but pull in updated server metadata (timeid, flags) if available
        mergedDays[dayKey as DayKey] = {
          ...displayedDayEntry,
          hours: localEdits.get(localEditKey) ?? displayedDayEntry.hours,
          timeid: freshDayEntry?.timeid ?? displayedDayEntry.timeid,
          approved: freshDayEntry?.approved ?? displayedDayEntry.approved,
          submitted: freshDayEntry?.submitted ?? displayedDayEntry.submitted,
          disabled: freshDayEntry?.disabled ?? displayedDayEntry.disabled,
        };
      } else if (freshDayEntry !== undefined) {
        // No local edit and fresh data is available → take fresh
        mergedDays[dayKey as DayKey] = freshDayEntry;
      } else if (freshRow === undefined && displayedDayEntry !== undefined) {
        // Row is absent from fresh entirely → keep displayed as-is
        // (user may have just added this row locally)
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
}

/**
 * Produce a fresh DayEntry with updated server metadata but preserved local hours.
 * Used when the server confirms a save (we get back a timeid).
 */
export function patchDayEntry(
  existingDayEntry: DayEntry | undefined,
  patch: Partial<DayEntry>,
): DayEntry {
  return {
    hours: existingDayEntry?.hours ?? 0,
    memo: existingDayEntry?.memo ?? "",
    timeid: existingDayEntry?.timeid ?? "",
    approved: existingDayEntry?.approved ?? false,
    submitted: existingDayEntry?.submitted ?? false,
    disabled: existingDayEntry?.disabled ?? false,
    ...patch,
  };
}
