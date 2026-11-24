// Development stub: lets the UI be built and demoed without Chrome or
// NetSuite. Only used when the extension host is started with
// NETSUITE_TRACKER_MOCK=1 (see the "mock data" launch configuration).

import * as vscode from "vscode";
import type {
  BridgeDayKey,
  DeleteRowParams,
  SetDayHoursParams,
  WeekResult,
  WireDayEntry,
  WireRow,
} from "@protocol";
import { DAY_KEYS } from "@/model/weekModel";
import { getMondayISO, todayISO } from "@/utils/dates";
import {
  RepositoryError,
  type RepositoryStatus,
  type WeekRepository,
} from "./weekRepository";

const SIMULATED_LATENCY_MS = 250;

const PROJECTS = [
  { id: "100", name: "Acme Portal" },
  { id: "101", name: "Internal Tools" },
  { id: "102", name: "Support Rotation" },
];

const TASKS_BY_PROJECT: Record<string, Array<{ id: string; name: string }>> = {
  "100": [
    { id: "200", name: "Development" },
    { id: "201", name: "Code Review" },
  ],
  "101": [{ id: "210", name: "Maintenance" }],
  "102": [
    { id: "220", name: "Triage" },
    { id: "221", name: "On Call" },
  ],
};

let nextTimeid = 70000;

function buildEntry(
  hours: number,
  memo: string,
  isLocked: boolean,
): WireDayEntry {
  nextTimeid += 1;
  return {
    hours,
    memo,
    timeid: String(nextTimeid),
    approved: isLocked,
    submitted: false,
    disabled: false,
  };
}

function buildRow(
  projectId: string,
  taskId: string,
  days: Partial<Record<BridgeDayKey, WireDayEntry>>,
): WireRow {
  const project = PROJECTS.find((candidate) => candidate.id === projectId);
  const task = TASKS_BY_PROJECT[projectId]?.find(
    (candidate) => candidate.id === taskId,
  );
  return {
    rowKey: `${projectId}_${taskId}_754`,
    projectId,
    projectName: project?.name ?? projectId,
    taskId,
    taskName: task?.name ?? taskId,
    days,
  };
}

function buildSampleWeek(mondayISO: string): WeekResult {
  const isPastWeek = mondayISO < getMondayISO(todayISO());
  // Past weeks are approved by now, which exercises the locked-cell UI
  const entry = (hours: number, memo = "") =>
    buildEntry(hours, memo, isPastWeek);

  return {
    mondayISO,
    userId: "91333",
    rows: [
      buildRow("100", "200", {
        mon: entry(4, "Auth refactor"),
        tue: entry(6, "Token refresh bug"),
        wed: entry(5),
        thu: entry(3, "Review feedback"),
      }),
      buildRow("100", "201", { mon: entry(2), wed: entry(1.5) }),
      buildRow("101", "210", { mon: entry(2), tue: entry(2, "CI cleanup") }),
      buildRow("102", "220", { wed: entry(1.5, "Customer escalation") }),
    ],
    holidays: {},
    projects: PROJECTS,
    tasksByProject: TASKS_BY_PROJECT,
  };
}

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createMockWeekRepository(): WeekRepository {
  const weeksByMonday = new Map<string, WeekResult>();
  const statusEmitter = new vscode.EventEmitter<RepositoryStatus>();

  const getOrCreateWeek = (mondayISO: string): WeekResult => {
    const existingWeek = weeksByMonday.get(mondayISO);
    if (existingWeek) return existingWeek;
    const newWeek = buildSampleWeek(mondayISO);
    weeksByMonday.set(mondayISO, newWeek);
    return newWeek;
  };

  return {
    status: "connected",
    onDidChangeStatus: statusEmitter.event,
    accountOrigin: null,

    async getWeek(mondayISO) {
      await wait(SIMULATED_LATENCY_MS);
      return structuredClone(getOrCreateWeek(mondayISO));
    },

    async setDayHours(params: SetDayHoursParams) {
      await wait(SIMULATED_LATENCY_MS);
      const week = getOrCreateWeek(params.mondayISO);
      const existingRow = week.rows.find(
        (row) =>
          row.projectId === params.projectId && row.taskId === params.taskId,
      );
      const existingEntry = existingRow?.days[params.dayKey];
      const updatedEntry: WireDayEntry = existingEntry
        ? {
            ...existingEntry,
            hours: params.hours,
            memo: params.memo ?? existingEntry.memo,
          }
        : buildEntry(params.hours, params.memo ?? "", false);

      if (existingRow) {
        existingRow.days[params.dayKey] = updatedEntry;
      } else {
        week.rows.push(
          buildRow(params.projectId, params.taskId, {
            [params.dayKey]: updatedEntry,
          }),
        );
      }
      return structuredClone(week);
    },

    async deleteRow(params: DeleteRowParams) {
      await wait(SIMULATED_LATENCY_MS);
      const week = getOrCreateWeek(params.mondayISO);
      const requestedTimeids = new Set(params.timeids);
      const affectedRows = week.rows.filter((row) =>
        DAY_KEYS.some((dayKey) =>
          requestedTimeids.has(row.days[dayKey]?.timeid ?? ""),
        ),
      );
      const hasApprovedEntry = affectedRows.some((row) =>
        DAY_KEYS.some((dayKey) => row.days[dayKey]?.approved),
      );
      if (hasApprovedEntry) {
        throw new RepositoryError(
          "BAD_REQUEST",
          "That row has approved entries and can't be deleted.",
        );
      }
      week.rows = week.rows.filter((row) => !affectedRows.includes(row));
      return structuredClone(week);
    },
  };
}
