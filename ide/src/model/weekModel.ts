// Pure logic behind the week view: no `vscode` import, so it is trivially
// testable and can't be tangled up with UI concerns.

import type {
  BridgeDayKey,
  WeekResult,
  WireDayEntry,
  WireRow,
} from "@protocol";
import { addDays } from "@/utils/dates";

export const DAY_KEYS: readonly BridgeDayKey[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

const DAY_NAMES: Record<BridgeDayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const WEEKEND_DAY_KEYS: readonly BridgeDayKey[] = ["sat", "sun"];

export const WEEKLY_TARGET_HOURS = 40;
export const WORKDAYS_PER_WEEK = 5;
export const WORKDAY_TARGET_HOURS = WEEKLY_TARGET_HOURS / WORKDAYS_PER_WEEK;
export const MAX_HOURS_PER_DAY = 24;

// ── Hours formatting and parsing ─────────────────────────────────────────────

export function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

function sumHours(hoursList: number[]): number {
  let total = 0;
  hoursList.forEach((hours) => {
    total += hours;
  });
  return roundHours(total);
}

/** 8 -> "8h", 1.5 -> "1.5h", 0 -> "0h" */
export function formatHours(hours: number): string {
  return `${roundHours(hours)}h`;
}

/**
 * Accepts "1.5", "1,5" and "1:30". Returns null for anything else or when the
 * value is outside 0–24.
 */
export function parseHoursInput(text: string): number | null {
  const trimmedText = text.trim();
  const clockMatch = trimmedText.match(/^(\d{1,2}):([0-5]\d)$/);
  const decimalMatch = trimmedText.match(/^\d{1,2}([.,]\d{1,2})?$/);

  let hours: number;
  if (clockMatch) {
    hours = Number(clockMatch[1]) + Number(clockMatch[2]) / 60;
  } else if (decimalMatch) {
    hours = Number(trimmedText.replace(",", "."));
  } else {
    return null;
  }

  hours = roundHours(hours);
  return hours >= 0 && hours <= MAX_HOURS_PER_DAY ? hours : null;
}

// ── Day summaries ────────────────────────────────────────────────────────────

export type DayStatus =
  | "complete" // reached the daily target
  | "missing" // a past workday under the target
  | "today" // today, still under the target
  | "upcoming" // a future workday
  | "holiday"
  | "weekend";

export interface EntrySummary {
  rowKey: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
  dayKey: BridgeDayKey;
  entry: WireDayEntry;
  /** Why the cell is read-only, or null when it can be edited. */
  lockReason: string | null;
}

export interface DaySummary {
  dayKey: BridgeDayKey;
  dateISO: string;
  /** "Mon 23" */
  label: string;
  totalHours: number;
  entries: EntrySummary[];
  holidayName: string | null;
  status: DayStatus;
}

function getLockReason(entry: WireDayEntry): string | null {
  if (entry.approved) return "Approved";
  if (entry.submitted) return "Submitted";
  if (entry.disabled) return "Locked";
  return null;
}

function getDayStatus(
  dayKey: BridgeDayKey,
  dateISO: string,
  todayISO: string,
  totalHours: number,
  holidayName: string | null,
): DayStatus {
  if (WEEKEND_DAY_KEYS.includes(dayKey)) return "weekend";
  if (totalHours >= WORKDAY_TARGET_HOURS) return "complete";
  if (holidayName !== null) return "holiday";
  if (dateISO === todayISO) return "today";
  return dateISO < todayISO ? "missing" : "upcoming";
}

function buildEntrySummaries(
  rows: WireRow[],
  dayKey: BridgeDayKey,
): EntrySummary[] {
  return rows
    .flatMap((row) => {
      const entry = row.days[dayKey];
      // A cell without a timeid has never been saved, so it isn't an entry
      if (!entry || entry.timeid === "") return [];
      return [
        {
          rowKey: row.rowKey,
          projectId: row.projectId,
          projectName: row.projectName,
          taskId: row.taskId,
          taskName: row.taskName,
          dayKey,
          entry,
          lockReason: getLockReason(entry),
        },
      ];
    })
    .sort((first, second) =>
      `${first.projectName}${first.taskName}`.localeCompare(
        `${second.projectName}${second.taskName}`,
      ),
    );
}

export function buildDaySummaries(
  week: WeekResult,
  todayISO: string,
): DaySummary[] {
  return DAY_KEYS.map((dayKey, dayIndex) => {
    const dateISO = addDays(week.mondayISO, dayIndex);
    const entries = buildEntrySummaries(week.rows, dayKey);
    const totalHours = sumHours(entries.map((summary) => summary.entry.hours));
    const holidayName = week.holidays[dayKey] ?? null;
    return {
      dayKey,
      dateISO,
      label: `${DAY_NAMES[dayKey]} ${Number(dateISO.slice(8))}`,
      totalHours,
      entries,
      holidayName,
      status: getDayStatus(dayKey, dateISO, todayISO, totalHours, holidayName),
    };
  });
}

export function getWeekTotalHours(days: DaySummary[]): number {
  return sumHours(days.map((day) => day.totalHours));
}

// ── Target progress ──────────────────────────────────────────────────────────

export interface TargetProgress {
  totalHours: number;
  percent: number;
  state: "under" | "met" | "over";
  /** Hours still missing (under) or beyond the target (over); 0 when met. */
  differenceHours: number;
}

function getTargetState(
  signedDifferenceHours: number,
): TargetProgress["state"] {
  if (signedDifferenceHours < 0) return "under";
  return signedDifferenceHours === 0 ? "met" : "over";
}

export function getTargetProgress(totalHours: number): TargetProgress {
  const differenceHours = roundHours(totalHours - WEEKLY_TARGET_HOURS);
  return {
    totalHours,
    percent: Math.round((totalHours / WEEKLY_TARGET_HOURS) * 100),
    state: getTargetState(differenceHours),
    differenceHours: Math.abs(differenceHours),
  };
}

/** "▰▰▰▰▰▰▰▰▱▱" — filled segments for the share of the target reached. */
export function renderProgressBar(percent: number, segments = 10): string {
  const filledSegments = Math.min(
    segments,
    Math.max(0, Math.round((percent / 100) * segments)),
  );
  return "▰".repeat(filledSegments) + "▱".repeat(segments - filledSegments);
}

// ── Lookups ──────────────────────────────────────────────────────────────────

/**
 * The saved entry (has a timeid) for a project+task on a day. NS can split one
 * project+task across several rows, so every matching row is searched — the
 * same rule the Chrome extension uses before saving.
 */
export function findSavedEntry(
  week: WeekResult,
  projectId: string,
  taskId: string,
  dayKey: BridgeDayKey,
): WireDayEntry | undefined {
  return week.rows
    .filter((row) => row.projectId === projectId && row.taskId === taskId)
    .map((row) => row.days[dayKey])
    .find((entry) => entry !== undefined && entry.timeid !== "");
}
