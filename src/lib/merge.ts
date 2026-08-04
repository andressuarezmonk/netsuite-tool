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
  displayed: WeekData,
  fresh: WeekData,
  localEdits: Map<string, number>,
): WeekData {
  const freshRowMap = new Map(
    fresh.rows.map((r) => [r.rowKey, r]),
  );
  const resultRows: TimeRow[] = [];

  // Process rows that are currently displayed
  for (const displayedRow of displayed.rows) {
    const rowKey = displayedRow.rowKey;
    const freshRow = freshRowMap.get(rowKey);
    // localEdits is keyed as "projId_taskId_dayKey" (set in App.tsx handleSave)
    const editBase = `${displayedRow.projId}_${displayedRow.taskId}`;

    const mergedDays = { ...displayedRow.days };

    for (const dk of DAYS as readonly DayKey[]) {
      const displayedEntry = displayedRow.days[dk];
      const freshEntry = freshRow?.days[dk];
      const editKey = `${editBase}_${dk}`;
      const hasLocalEdit = localEdits.has(editKey);

      if (freshEntry?.approved) {
        // Approved on server → always take fresh value, local edit is irrelevant
        mergedDays[dk] = freshEntry;
      } else if (hasLocalEdit) {
        // User made a local edit to this cell → keep their value
        // but update metadata (timeid, memo) from fresh if available
        if (displayedEntry) {
          mergedDays[dk] = {
            ...displayedEntry,
            // Preserve local edit hours
            hours: localEdits.get(editKey) ?? displayedEntry.hours,
            // Update server-side metadata if fresh has it
            timeid: freshEntry?.timeid ?? displayedEntry.timeid,
            approved: freshEntry?.approved ?? displayedEntry.approved,
            submitted: freshEntry?.submitted ?? displayedEntry.submitted,
            disabled: freshEntry?.disabled ?? displayedEntry.disabled,
          };
        }
      } else if (freshEntry !== undefined) {
        // No local edit, fresh data available → take fresh
        mergedDays[dk] = freshEntry;
      } else if (freshRow !== undefined && displayedEntry !== undefined) {
        // Row exists in fresh but this day has no entry → cell is now empty on server
        delete mergedDays[dk];
      }
      // else: no fresh row for this row at all, keep displayed as-is
    }

    resultRows.push({ ...displayedRow, days: mergedDays });
    freshRowMap.delete(rowKey); // mark as processed
  }

  // Add new rows from server that weren't in the displayed data
  for (const freshRow of freshRowMap.values()) {
    resultRows.push(freshRow);
  }

  // Filter out rows with no days (empty rows from either source)
  const nonEmpty = resultRows.filter((r) => Object.keys(r.days).length > 0);

  return { ...fresh, rows: nonEmpty };
}

/**
 * Produce a fresh DayEntry with updated server metadata but preserved local hours.
 * Used when the server confirms a save (we get back a timeid).
 */
export function patchDayEntry(
  existing: DayEntry | undefined,
  patch: Partial<DayEntry>,
): DayEntry {
  return {
    hours: existing?.hours ?? 0,
    memo: existing?.memo ?? "",
    timeid: existing?.timeid ?? "",
    approved: existing?.approved ?? false,
    submitted: existing?.submitted ?? false,
    disabled: existing?.disabled ?? false,
    ...patch,
  };
}
