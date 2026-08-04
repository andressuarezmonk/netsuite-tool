import { getHandler, DAYS } from "./constants";
import {
  addDays,
  hoursToNS,
  nsToHours,
  toApiDate,
  fromApiDate,
  dayIndexFromMonday,
  dayKeyFromIndex,
} from "./dates";
import type { Project, Task, TimeRow, WeekData, SaveRowParams } from "./types";

// ── Module-level state ──────────────────────────────────────────────────────

let _userId = "";
let _defaultItemId = "754";
let _projects: Project[] = [];
let _tasks: Record<string, Task[]> = {};

// Date shift: NS server (US/Pacific UTC-7) vs Buenos Aires (UTC-3) = +1 day offset.
// API dates are 1 day behind the real date they represent.
// e.g. API "7/30/2026" = actual Friday 7/31/2026.
const DATE_SHIFT = 1;

export function getProjects() {
  return _projects;
}
export function getTasks(projId: string) {
  return _tasks[projId] ?? [];
}
export function getUserId() {
  return _userId;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(url: string): Promise<string> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  return text.replace(/<!--[\s\S]*$/, "").trim();
}

// ── Init ─────────────────────────────────────────────────────────────────────

export async function loadInit(): Promise<void> {
  const raw = await apiFetch(`${getHandler()}&requestType=init&opType=fetch`);
  const d = JSON.parse(raw.substring(0, raw.lastIndexOf("}") + 1));
  _userId = String(d.userid ?? "");
  _defaultItemId = String(d.serviceitemtobedefault ?? "754");
}

// ── Week data ─────────────────────────────────────────────────────────────────

export async function loadWeek(mondayISO: string): Promise<WeekData> {
  // Three parallel fetches to cover the full Mon–Sun display window.
  // NS server uses Sun–Sat weeks internally and only returns entries up to today.
  // - Primary   (shift):     covers Mon–Thu of the displayed week (NS Sun–Sat starting shift days back)
  // - Overlap   (shift - 1): covers Fri–Sat (falls in NS's next Sun–Sat window)
  // - Next week (shift):     catches any entries for future days of the week
  const weekNS = toApiDate(mondayISO, DATE_SHIFT);
  const weekNSOvlp = toApiDate(mondayISO, DATE_SHIFT - 1);
  const nextMondayISO = addDays(mondayISO, 7);
  const nextWeekNS = toApiDate(nextMondayISO, DATE_SHIFT);

  const [raw, rawOvlp, rawNext] = await Promise.all([
    apiFetch(
      `${getHandler()}&opType=fetch&requestType=time&week=${encodeURIComponent(weekNS)}&employee=${_userId}`,
    ),
    apiFetch(
      `${getHandler()}&opType=fetch&requestType=time&week=${encodeURIComponent(weekNSOvlp)}&employee=${_userId}`,
    ),
    apiFetch(
      `${getHandler()}&opType=fetch&requestType=time&week=${encodeURIComponent(nextWeekNS)}&employee=${_userId}`,
    ),
  ]);

  const data = JSON.parse(raw);
  const dataOvlp = JSON.parse(rawOvlp);
  const dataNext = JSON.parse(rawNext);

  // Merge projects
  const projMap = new Map<string, Project>();
  for (const src of [data, dataOvlp, dataNext]) {
    for (const p of (src.projectsorig ?? []) as Array<{
      internalid: string;
      display: string;
    }>) {
      const id = p.internalid.split("|")[0];
      if (!projMap.has(id))
        projMap.set(id, { id, raw: p.internalid, name: p.display });
    }
  }
  _projects = [...projMap.values()];

  // Merge tasks
  _tasks = {};
  for (const src of [data, dataOvlp, dataNext]) {
    for (const [pid, arr] of Object.entries(
      src.projecttasksorig ?? {},
    ) as Array<[string, Array<{ internalid: string; display: string }>]>) {
      if (!_tasks[pid]) _tasks[pid] = [];
      const seen = new Set(_tasks[pid].map((t: Task) => t.id));
      for (const t of arr ?? []) {
        const id = t.internalid.split("|")[0];
        if (!seen.has(id)) {
          _tasks[pid].push({ id, raw: t.internalid, name: t.display });
          seen.add(id);
        }
      }
    }
  }

  // Merge time entries
  const mergedEntries: Record<string, Array<Record<string, unknown>>> = {};
  for (const src of [data, dataOvlp, dataNext]) {
    for (const [key, val] of Object.entries(src.timeentries ?? {}) as Array<
      [string, Array<Record<string, unknown>>]
    >) {
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
    const itemId = parts[2] ?? _defaultItemId;

    const proj = _projects.find((p) => p.id === projId);
    const task = (_tasks[projId] ?? []).find((t: Task) => t.id === taskId);

    const days: TimeRow["days"] = {};
    for (const dayObj of dayArr) {
      for (const [dateNS, entry] of Object.entries(
        dayObj as Record<string, Record<string, unknown>>,
      )) {
        const iso = fromApiDate(dateNS, DATE_SHIFT);
        const diff = dayIndexFromMonday(iso, mondayISO);
        if (diff < 0 || diff >= 7) continue;
        const dk = dayKeyFromIndex(diff);
        if (dk) {
          days[dk] = {
            hours: nsToHours(entry.hours as string),
            memo: (entry.memo as string) ?? "",
            timeid: (entry.internalid as string) ?? "",
            approved: entry.approval === "T",
            // "rejected=3" means submitted/pending; only flag as submitted if not already approved
            submitted: entry.approval !== "T" && entry.rejected === "3",
            disabled: entry.disableLine === true,
          };
        }
      }
    }

    const dedupKey = `${projId}_${taskId}`;
    const existing = rowMap.get(dedupKey);
    if (
      !existing ||
      Object.keys(days).length > Object.keys(existing.days).length
    ) {
      rowMap.set(dedupKey, {
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
  return { rows, weekStart: mondayISO };
}

// ── Delete ────────────────────────────────────────────────────────────────────

/** Delete all time records for a row (pass all timeid values from its days). */
export async function deleteRow(timeids: string[]): Promise<void> {
  // Filter out empty timeids (days with no saved record)
  const ids = timeids.filter((id) => id.trim() !== "");
  if (ids.length === 0) return; // nothing saved yet — just remove from UI

  const params = new URLSearchParams({
    opType: "deleteRecords",
    payLoad: JSON.stringify(ids),
  });
  const r = await fetch(`${getHandler()}&${params.toString()}`, {
    method: "GET",
    credentials: "include",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  // deleteRecords returns an empty body or {} on success — no further check needed
}

export async function saveRow(params: SaveRowParams): Promise<void> {
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

  const block = {
    emp: _userId,
    proj: projNumeric,
    projtask: taskNumeric,
    item: itemId || _defaultItemId,
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
  };

  // Use saveAll with an array payload — matches exactly what the original NS tool sends
  const params_ = new URLSearchParams({
    opType: "saveAll",
    payLoad: JSON.stringify([block]),
  });
  const r = await fetch(`${getHandler()}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: params_.toString(),
  });

  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}`);

  try {
    const resp = JSON.parse(text);
    const items = Array.isArray(resp) ? resp : [resp];
    let anySaved = false;
    for (const item of items) {
      if (
        item.errors &&
        item.errors !== "" &&
        item.errors !== "Saving success."
      ) {
        throw new Error(item.errors as string);
      }
      // Verify the server actually created or updated the record
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
  } catch (e) {
    if (e instanceof SyntaxError)
      throw new Error(text.substring(0, 200), { cause: e });
    throw e;
  }
}
