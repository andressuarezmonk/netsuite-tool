// The data the week grid renders. Pure and JSON-serialisable: the extension
// host builds it and posts it to the webview, which only draws it.

import type { BridgeDayKey, WeekResult, WireDayEntry } from "@protocol";
import {
  DAY_KEYS,
  WEEKLY_TARGET_HOURS,
  WORKDAYS_PER_WEEK,
  WORKDAY_TARGET_HOURS,
  roundHours,
  sumHours,
  DAY_NAMES,
} from "@/model/weekModel";
import { addDays, formatWeekRange, getMondayISO } from "@/utils/dates";

/** What the sidebar should show. Anything but "ready" shows a message card. */
export type ViewState =
  | "loading"
  | "ready"
  | "notPaired"
  | "waiting"
  | "sessionExpired"
  | "notConfigured"
  | "error";

export type CellStatus = "editable" | "approved" | "submitted" | "locked";
export type DayTargetStatus = "under" | "over" | null;

export interface DayColumn {
  dayKey: BridgeDayKey;
  /** "Mon" */
  weekdayLabel: string;
  /** "23/11", like the web grid */
  dateLabel: string;
  dateISO: string;
  isToday: boolean;
  isWeekend: boolean;
  holidayName: string | null;
  totalHours: number;
  /** Whether the total is worth showing (some entry exists, or the day is under target). */
  showsTotal: boolean;
  targetStatus: DayTargetStatus;
}

export interface CellModel {
  hours: number;
  memo: string;
  status: CellStatus;
}

export interface RowModel {
  rowKey: string;
  projectId: string;
  taskId: string;
  projectName: string;
  taskName: string;
  cells: Partial<Record<BridgeDayKey, CellModel>>;
  totalHours: number;
  hasApprovedEntry: boolean;
}

export interface NamedItem {
  id: string;
  name: string;
}

export interface ProgressModel {
  totalHours: number;
  targetHours: number;
  /** Capped at 100 for the bar. */
  percent: number;
  state: "under" | "met" | "over";
  /** "8h remaining" / "Target reached ✓" / "4h over" */
  label: string;
  weekdayHolidayCount: number;
}

export interface WeekViewModel {
  state: ViewState;
  errorMessage: string;
  mondayISO: string;
  rangeLabel: string;
  isCurrentWeek: boolean;
  days: DayColumn[];
  rows: RowModel[];
  projects: NamedItem[];
  tasksByProject: Record<string, NamedItem[]>;
  progress: ProgressModel;
}

const WEEKEND_DAY_KEYS: readonly BridgeDayKey[] = ["sat", "sun"];
const HOURS_EPSILON = 0.01;

/** "8", "1.5", "0" — the number shown inside a cell. */
export function formatPlainHours(hours: number): string {
  return String(roundHours(hours));
}

function toCellStatus(entry: WireDayEntry): CellStatus {
  if (entry.approved) return "approved";
  if (entry.submitted) return "submitted";
  return entry.disabled ? "locked" : "editable";
}

/**
 * Same judgement as the web grid: only Mon–Fri are measured, "over" counts
 * always, "under" only for days that are already past.
 */
function getDayTargetStatus(
  dayKey: BridgeDayKey,
  dateISO: string,
  todayISO: string,
  totalHours: number,
): DayTargetStatus {
  if (WEEKEND_DAY_KEYS.includes(dayKey)) return null;
  if (totalHours > WORKDAY_TARGET_HOURS + HOURS_EPSILON) return "over";
  const isPast = dateISO < todayISO;
  if (isPast && totalHours < WORKDAY_TARGET_HOURS - HOURS_EPSILON) {
    return "under";
  }
  return null;
}

function buildRows(week: WeekResult): RowModel[] {
  return week.rows
    .map((row): RowModel => {
      const cells: RowModel["cells"] = {};
      const hoursList: number[] = [];
      let hasApprovedEntry = false;
      DAY_KEYS.forEach((dayKey) => {
        const entry = row.days[dayKey];
        if (!entry) return;
        cells[dayKey] = {
          hours: entry.hours,
          memo: entry.memo,
          status: toCellStatus(entry),
        };
        hoursList.push(entry.hours);
        if (entry.approved) hasApprovedEntry = true;
      });
      return {
        rowKey: row.rowKey,
        projectId: row.projectId,
        taskId: row.taskId,
        projectName: row.projectName,
        taskName: row.taskName,
        cells,
        totalHours: sumHours(hoursList),
        hasApprovedEntry,
      };
    })
    .sort((first, second) =>
      `${first.projectName}\u0000${first.taskName}`.localeCompare(
        `${second.projectName}\u0000${second.taskName}`,
      ),
    );
}

function buildDays(
  week: WeekResult,
  rows: RowModel[],
  todayISO: string,
): DayColumn[] {
  return DAY_KEYS.map((dayKey, dayIndex) => {
    const dateISO = addDays(week.mondayISO, dayIndex);
    const totalHours = sumHours(
      rows.map((row) => row.cells[dayKey]?.hours ?? 0),
    );
    const hasEntries = rows.some((row) => row.cells[dayKey] !== undefined);
    const targetStatus = getDayTargetStatus(
      dayKey,
      dateISO,
      todayISO,
      totalHours,
    );
    return {
      dayKey,
      weekdayLabel: DAY_NAMES[dayKey],
      dateLabel: `${dateISO.slice(8)}/${dateISO.slice(5, 7)}`,
      dateISO,
      isToday: dateISO === todayISO,
      isWeekend: WEEKEND_DAY_KEYS.includes(dayKey),
      holidayName: week.holidays[dayKey] ?? null,
      totalHours,
      showsTotal: hasEntries || targetStatus === "under",
      targetStatus,
    };
  });
}

function buildProgress(week: WeekResult, totalHours: number): ProgressModel {
  const difference = roundHours(WEEKLY_TARGET_HOURS - totalHours);
  const isOver = difference < -HOURS_EPSILON;
  const isMet = !isOver && difference < HOURS_EPSILON;
  const weekdayHolidayCount = DAY_KEYS.slice(0, WORKDAYS_PER_WEEK).filter(
    (dayKey) => week.holidays[dayKey],
  ).length;

  let label = `${formatPlainHours(difference)}h remaining`;
  if (isOver) label = `${formatPlainHours(-difference)}h over`;
  else if (isMet) label = "Target reached ✓";

  return {
    totalHours,
    targetHours: WEEKLY_TARGET_HOURS,
    percent: Math.min(
      100,
      Math.round((totalHours / WEEKLY_TARGET_HOURS) * 100),
    ),
    state: isOver ? "over" : isMet ? "met" : "under",
    label,
    weekdayHolidayCount,
  };
}

export interface WeekViewModelInput {
  viewState: ViewState;
  errorMessage: string;
  week: WeekResult | null;
  mondayISO: string;
  todayISO: string;
}

const EMPTY_PROGRESS: ProgressModel = {
  totalHours: 0,
  targetHours: WEEKLY_TARGET_HOURS,
  percent: 0,
  state: "under",
  label: `${WEEKLY_TARGET_HOURS}h remaining`,
  weekdayHolidayCount: 0,
};

export function buildWeekViewModel(input: WeekViewModelInput): WeekViewModel {
  const { viewState, errorMessage, week, mondayISO, todayISO } = input;
  const base = {
    state: viewState,
    errorMessage,
    mondayISO,
    rangeLabel: formatWeekRange(mondayISO),
    isCurrentWeek: mondayISO === getMondayISO(todayISO),
  };

  if (!week || viewState !== "ready") {
    return {
      ...base,
      days: [],
      rows: [],
      projects: [],
      tasksByProject: {},
      progress: EMPTY_PROGRESS,
    };
  }

  const rows = buildRows(week);
  const days = buildDays(week, rows, todayISO);
  return {
    ...base,
    days,
    rows,
    projects: [...week.projects].sort((first, second) =>
      first.name.localeCompare(second.name),
    ),
    tasksByProject: week.tasksByProject,
    progress: buildProgress(week, sumHours(days.map((day) => day.totalHours))),
  };
}
