import {
  addDays,
  toApiDate,
  fromApiDate,
  dayIndexFromMonday,
  dayKeyFromIndex,
  nsToHours,
} from "../utils/dates";
import { NSApprovalStatus, NSSubmittedStatus } from "../constants/nsEnums";
import { FetchService, type NSWeekResponse } from "./fetch.service";
import type { Project, Task, TimeRow, WeekData } from "../utils/types";

const DATE_SHIFT = 1;

export interface LoadWeekResult {
  weekData: WeekData;
  projects: Project[];
  tasks: Record<string, Task[]>;
}

export async function loadWeek(
  mondayISO: string,
  userId: string,
  defaultItemId: string,
): Promise<LoadWeekResult> {
  // Three parallel fetches to cover the full Mon–Sun display window.
  // NS server uses Sun–Sat weeks internally and only returns entries up to today.
  // - Primary   (shift):     covers Mon–Thu of the displayed week (NS Sun–Sat starting shift days back)
  // - Overlap   (shift - 1): covers Fri–Sat (falls in NS's next Sun–Sat window)
  // - Next week (shift):     catches any entries for future days of the week
  const weekNS = toApiDate(mondayISO, DATE_SHIFT);
  const weekNSOvlp = toApiDate(mondayISO, DATE_SHIFT - 1);
  const nextMondayISO = addDays(mondayISO, 7);
  const nextWeekNS = toApiDate(nextMondayISO, DATE_SHIFT);

  const [data, dataOvlp, dataNext] = await Promise.all([
    FetchService.fetchWeek(weekNS, userId),
    FetchService.fetchWeek(weekNSOvlp, userId),
    FetchService.fetchWeek(nextWeekNS, userId),
  ]);

  // Merge projects
  const projMap = new Map<string, Project>();
  for (const src of [data, dataOvlp, dataNext]) {
    for (const p of src.projectsorig ?? []) {
      const id = p.internalid.split("|")[0];
      if (!projMap.has(id))
        projMap.set(id, { id, raw: p.internalid, name: p.display });
    }
  }
  const projects = [...projMap.values()];

  // Merge tasks
  const tasks: Record<string, Task[]> = {};
  for (const src of [data, dataOvlp, dataNext]) {
    for (const [pid, arr] of Object.entries(src.projecttasksorig ?? {})) {
      if (!tasks[pid]) tasks[pid] = [];
      const seen = new Set(tasks[pid].map((t: Task) => t.id));
      for (const t of arr ?? []) {
        const id = t.internalid.split("|")[0];
        if (!seen.has(id)) {
          tasks[pid].push({ id, raw: t.internalid, name: t.display });
          seen.add(id);
        }
      }
    }
  }

  // Merge time entries
  const mergedEntries: NSWeekResponse["timeentries"] = {};
  for (const src of [data, dataOvlp, dataNext]) {
    for (const [key, val] of Object.entries(src.timeentries ?? {})) {
      if (mergedEntries[key]) {
        mergedEntries[key] = [...mergedEntries[key], ...val];
      } else {
        mergedEntries[key] = [...val];
      }
    }
  }

  // Parse rows, deduplicating by projId+taskId (keep row with most valid day entries)
  const rowMap = new Map<string, TimeRow>();

  for (const [key, dayArr] of Object.entries(mergedEntries)) {
    const parts = key.split("_");
    const projId = parts[0];
    const taskId = parts[1];
    const itemId = parts[2] ?? defaultItemId;

    const proj = projects.find((p) => p.id === projId);
    const task = (tasks[projId] ?? []).find((t: Task) => t.id === taskId);

    const days: TimeRow["days"] = {};
    for (const dayObj of dayArr) {
      for (const [dateNS, entry] of Object.entries(dayObj)) {
        const iso = fromApiDate(dateNS, DATE_SHIFT);
        const diff = dayIndexFromMonday(iso, mondayISO);
        if (diff < 0 || diff >= 7) continue;
        const dk = dayKeyFromIndex(diff);
        if (dk) {
          days[dk] = {
            hours: nsToHours(entry.hours),
            memo: entry.memo ?? "",
            timeid: entry.internalid ?? "",
            approved: entry.approval === NSApprovalStatus.Approved,
            // "rejected=3" means submitted/pending; only flag as submitted if not already approved
            submitted:
              entry.approval !== NSApprovalStatus.Approved &&
              entry.rejected === NSSubmittedStatus.Submitted,
            disabled: entry.disableLine === true,
          };
        }
      }
    }

    // Use the full API key as the unique row identifier — same project+task
    // can appear multiple times (e.g. users duplicate rows to work around
    // approved entries). Only deduplicate when the EXACT same key appears
    // in multiple fetches (primary / overlap / next-week), keeping the
    // version with the most valid day entries.
    const existing = rowMap.get(key);
    if (
      !existing ||
      Object.keys(days).length > Object.keys(existing.days).length
    ) {
      rowMap.set(key, {
        rowKey: key,
        projId,
        taskId,
        itemId,
        projName: proj?.name ?? projId,
        taskName: task?.name ?? taskId,
        projRaw: proj?.raw ?? projId,
        taskRaw: task?.raw ?? taskId,
        days,
      });
    }
  }

  const rows = [...rowMap.values()].filter(
    (r) => Object.keys(r.days).length > 0,
  );

  return { weekData: { rows, weekStart: mondayISO }, projects, tasks };
}
