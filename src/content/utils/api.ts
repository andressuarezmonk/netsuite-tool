import { DAYS } from "./constants";
import {
  addDays,
  hoursToNS,
  nsToHours,
  toApiDate,
  fromApiDate,
  dayIndexFromMonday,
  dayKeyFromIndex,
} from "./dates";
import { NSApprovalStatus, NSRejectedStatus } from "../../constants/nsEnums";
import {
  FetchService,
  type NSWeekResponse,
} from "../../services/fetch.service";
import { DeleteService } from "../../services/delete.service";
import { SaveService } from "../../services/save.service";
import type { Project, Task, TimeRow, WeekData, SaveRowParams } from "./types";

// Date shift: NS server (US/Pacific UTC-7) vs Buenos Aires (UTC-3) = +1 day offset.
// API dates are 1 day behind the real date they represent.
// e.g. API "7/30/2026" = actual Friday 7/31/2026.
const DATE_SHIFT = 1;

// ── Init ─────────────────────────────────────────────────────────────────────

export interface InitData {
  userId: string;
  defaultItemId: string;
}

export async function loadInit(): Promise<InitData> {
  const data = await FetchService.fetchInitial();
  return {
    userId: String(data.userid ?? ""),
    defaultItemId: String(data.serviceitemtobedefault ?? "754"),
  };
}

// ── Week data ─────────────────────────────────────────────────────────────────

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
              entry.rejected === NSRejectedStatus.Submitted,
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

// ── Delete ────────────────────────────────────────────────────────────────────

/** Delete all time records for a row (pass all timeid values from its days). */
export async function deleteRow(timeids: string[]): Promise<void> {
  const ids = timeids.filter((id) => id.trim() !== "");
  if (ids.length === 0) return; // nothing saved yet — just remove from UI

  await DeleteService.deleteRow(ids);
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveRow(
  params: SaveRowParams,
  userId: string,
  defaultItemId: string,
): Promise<void> {
  const { projRaw, taskRaw, itemId, weekISO, dayKey, hours, memo, timeid } =
    params;

  const projNumeric = projRaw.split("|")[0];
  const taskNumeric = taskRaw.split("|")[0];
  const dayIndex = DAYS.indexOf(dayKey);

  // Send the actual display date — the NS server takes the real date directly.
  // No DATE_SHIFT applied on save (shift is only for reading API responses).
  const actualDateISO = addDays(weekISO, dayIndex);
  const [y, m, d] = actualDateISO.split("-");
  const dayDate = `${parseInt(m)}/${parseInt(d)}/${y}`;

  const items = await SaveService.saveRow({
    emp: userId,
    proj: projNumeric,
    projtask: taskNumeric,
    item: itemId || defaultItemId,
    isbillable: false,
    class: null,
    location: null,
    department: null,
    rate: "1.00",
    blockid: 1,
    lines: [
      {
        day: dayKey,
        date: dayDate,
        time: hoursToNS(hours),
        memo: memo || "",
        timeid: timeid || "",
      },
    ],
  });

  let anySaved = false;
  for (const item of items) {
    if (
      item.errors &&
      item.errors !== "" &&
      item.errors !== "Saving success."
    ) {
      throw new Error(item.errors);
    }
    if (
      (item.created && item.created.length > 0) ||
      (item.updated && item.updated.length > 0)
    ) {
      anySaved = true;
    }
  }

  if (!anySaved) {
    throw new Error(
      "Server accepted the request but did not save the record. Please try again.",
    );
  }
}
