// Request handlers for the VS Code bridge. Thin wrappers over the same
// services the page uses — all NetSuite knowledge (date shift, three-fetch
// merge, row collapsing) stays in those services, not here.
//
// Runs in the background service worker: window-free modules only.

import axios from "axios";
import {
  PROTOCOL_VERSION,
  type BridgeError,
  type BridgeErrorCode,
  type BridgeRequestEnvelope,
  type BridgeRequestType,
  type BridgeResponse,
  type DeleteRowParams,
  type SetDayHoursParams,
  type StatusResult,
  type WeekResult,
} from "@protocol";
import { DEFAULT_ITEM_ID } from "@/constants/nsEnums";
import { SessionExpiredError } from "@/services/apiClient.service";
import { CacheService } from "@/services/cache.service";
import {
  ConnectionService,
  NotConfiguredError,
} from "@/services/connection.service";
import { FetchService } from "@/services/fetch.service";
import { RowService } from "@/services/row.service";
import { loadWeek, type LoadWeekResult } from "@/services/week.service";
import { DAYS, type DayKey } from "@/utils/days";
import { getMondayISO } from "@/utils/dates";
import { isRecord } from "@/utils/guards";
import { findDayEntries, findSavedDayEntry } from "@/utils/rows";

const MAX_HOURS_PER_DAY = 24;

// ── Errors ───────────────────────────────────────────────────────────────────

class BridgeHandlerError extends Error {
  code: BridgeErrorCode;

  constructor(code: BridgeErrorCode, message: string) {
    super(message);
    this.name = "BridgeHandlerError";
    this.code = code;
  }
}

const badRequest = (message: string) =>
  new BridgeHandlerError("BAD_REQUEST", message);

function toBridgeError(error: unknown): BridgeError {
  if (error instanceof BridgeHandlerError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof SessionExpiredError) {
    // The user may log back in as someone else — never reuse the old session.
    cachedSession = null;
    return { code: "SESSION_EXPIRED", message: error.message };
  }
  if (error instanceof NotConfiguredError) {
    return { code: "NOT_CONFIGURED", message: error.message };
  }
  if (axios.isAxiosError(error)) {
    return error.response
      ? {
          code: "NS_ERROR",
          message: `NetSuite responded with HTTP ${error.response.status}.`,
        }
      : { code: "NETWORK", message: "Could not reach NetSuite." };
  }
  return {
    code: "NS_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

// ── NetSuite session (user id + default item) ────────────────────────────────

interface NetSuiteSession {
  userId: string;
  defaultItemId: string;
}

let cachedSession: NetSuiteSession | null = null;

async function getSession(): Promise<NetSuiteSession> {
  if (cachedSession) return cachedSession;

  const initialData = await FetchService.fetchInitial();
  const userId = String(initialData.userid ?? "");
  if (userId === "") {
    throw new BridgeHandlerError(
      "NS_ERROR",
      "NetSuite did not return a user ID.",
    );
  }
  cachedSession = {
    userId,
    defaultItemId: String(
      initialData.serviceitemtobedefault ?? DEFAULT_ITEM_ID,
    ),
  };
  return cachedSession;
}

// ── Parameter parsing (params arrive as untrusted JSON) ──────────────────────

function parseRecord(rawParams: unknown): Record<string, unknown> {
  if (!isRecord(rawParams)) throw badRequest("Params must be an object.");
  return rawParams;
}

function readMondayISO(value: unknown): string {
  const isIsoDate =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!isIsoDate || getMondayISO(value) !== value) {
    throw badRequest("mondayISO must be a Monday formatted as YYYY-MM-DD.");
  }
  return value;
}

function readId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value === "") {
    throw badRequest(`${fieldName} must be a non-empty string.`);
  }
  return value;
}

function readDayKey(value: unknown): DayKey {
  const dayKey = DAYS.find((candidate) => candidate === value);
  if (!dayKey) throw badRequest(`dayKey must be one of ${DAYS.join(", ")}.`);
  return dayKey;
}

function readHours(value: unknown): number {
  const isValid =
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_HOURS_PER_DAY;
  if (!isValid) {
    throw badRequest(
      `hours must be a number between 0 and ${MAX_HOURS_PER_DAY}.`,
    );
  }
  return value;
}

function parseSetDayHoursParams(rawParams: unknown): SetDayHoursParams {
  const params = parseRecord(rawParams);
  if (params.memo !== undefined && typeof params.memo !== "string") {
    throw badRequest("memo must be a string.");
  }
  return {
    mondayISO: readMondayISO(params.mondayISO),
    projectId: readId(params.projectId, "projectId"),
    taskId: readId(params.taskId, "taskId"),
    dayKey: readDayKey(params.dayKey),
    hours: readHours(params.hours),
    memo: params.memo,
  };
}

function parseDeleteRowParams(rawParams: unknown): DeleteRowParams {
  const params = parseRecord(rawParams);
  const timeids = params.timeids;
  const isValid =
    Array.isArray(timeids) &&
    timeids.length > 0 &&
    timeids.every((id) => typeof id === "string" && /^\d+$/.test(id));
  if (!isValid) {
    throw badRequest("timeids must be a non-empty list of numeric ids.");
  }
  return { mondayISO: readMondayISO(params.mondayISO), timeids };
}

// ── Week loading ─────────────────────────────────────────────────────────────

function toWeekResult(userId: string, loadedWeek: LoadWeekResult): WeekResult {
  const { weekData, projects, tasks } = loadedWeek;
  return {
    mondayISO: weekData.weekStart,
    userId,
    rows: weekData.rows.map((row) => ({
      rowKey: row.rowKey,
      projectId: row.projId,
      projectName: row.projName,
      taskId: row.taskId,
      taskName: row.taskName,
      days: row.days,
    })),
    holidays: weekData.holidays,
    projects: projects.map(({ id, name }) => ({ id, name })),
    tasksByProject: Object.fromEntries(
      Object.entries(tasks).map(([projectId, projectTasks]) => [
        projectId,
        projectTasks.map(({ id, name }) => ({ id, name })),
      ]),
    ),
  };
}

/** Loads a week and refreshes the page's cache so it never shows stale hours. */
async function loadFreshWeek(mondayISO: string) {
  const session = await getSession();
  const loadedWeek = await loadWeek(
    mondayISO,
    session.userId,
    session.defaultItemId,
  );
  await CacheService.setCached(mondayISO, loadedWeek.weekData);
  return { session, loadedWeek };
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function getStatus(): Promise<StatusResult> {
  let accountOrigin: string | null = null;
  try {
    accountOrigin = (await ConnectionService.get()).origin;
  } catch (error) {
    if (!(error instanceof NotConfiguredError)) throw error;
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    extensionVersion: chrome.runtime.getManifest().version,
    accountOrigin,
  };
}

async function getWeek(rawParams: unknown): Promise<WeekResult> {
  const params = parseRecord(rawParams);
  const { session, loadedWeek } = await loadFreshWeek(
    readMondayISO(params.mondayISO),
  );
  return toWeekResult(session.userId, loadedWeek);
}

async function setDayHours(rawParams: unknown): Promise<WeekResult> {
  const params = parseSetDayHoursParams(rawParams);
  const { session, loadedWeek } = await loadFreshWeek(params.mondayISO);
  const { projects, tasks, weekData } = loadedWeek;

  const project = projects.find(
    (candidate) => candidate.id === params.projectId,
  );
  const task = (tasks[params.projectId] ?? []).find(
    (candidate) => candidate.id === params.taskId,
  );
  if (!project || !task) {
    throw badRequest(
      "That project and task aren't available to you in NetSuite for this week.",
    );
  }

  // Same rule as the page: approved, submitted and disabled cells are read-only.
  const dayEntries = findDayEntries(
    weekData.rows,
    params.projectId,
    params.taskId,
    params.dayKey,
  );
  const isLocked = dayEntries.some(
    (entry) => entry.approved || entry.submitted || entry.disabled,
  );
  if (isLocked) {
    throw badRequest("That day is approved, submitted or locked in NetSuite.");
  }

  // Reuse the existing record's timeid so NS updates it instead of creating a
  // duplicate — the page does the same before every save.
  const savedEntry = findSavedDayEntry(
    weekData.rows,
    params.projectId,
    params.taskId,
    params.dayKey,
  );
  const existingRow = weekData.rows.find(
    (row) => row.projId === params.projectId && row.taskId === params.taskId,
  );

  await RowService.saveRow(
    {
      projRaw: project.raw,
      taskId: task.id,
      taskRaw: task.raw,
      itemId: existingRow?.itemId ?? session.defaultItemId,
      weekISO: params.mondayISO,
      dayKey: params.dayKey,
      hours: params.hours,
      memo: params.memo ?? savedEntry?.memo ?? "",
      timeid: savedEntry?.timeid ?? "",
    },
    session.userId,
    session.defaultItemId,
  );

  const refreshed = await loadFreshWeek(params.mondayISO);
  return toWeekResult(refreshed.session.userId, refreshed.loadedWeek);
}

async function deleteRow(rawParams: unknown): Promise<WeekResult> {
  const params = parseDeleteRowParams(rawParams);
  const { loadedWeek } = await loadFreshWeek(params.mondayISO);

  // Same rule as the page: a row with any approved entry can't be deleted.
  const requestedTimeids = new Set(params.timeids);
  const hasApprovedEntry = loadedWeek.weekData.rows
    .filter((row) =>
      DAYS.some((dayKey) =>
        requestedTimeids.has(row.days[dayKey]?.timeid ?? ""),
      ),
    )
    .some((row) => DAYS.some((dayKey) => row.days[dayKey]?.approved));
  if (hasApprovedEntry) {
    throw badRequest("That row has approved entries and can't be deleted.");
  }

  await RowService.deleteRow(params.timeids);

  const refreshed = await loadFreshWeek(params.mondayISO);
  return toWeekResult(refreshed.session.userId, refreshed.loadedWeek);
}

const handlers: Record<
  BridgeRequestType,
  (rawParams: unknown) => Promise<unknown>
> = {
  getStatus,
  getWeek,
  setDayHours,
  deleteRow,
};

export async function handleBridgeRequest(
  envelope: BridgeRequestEnvelope,
): Promise<BridgeResponse> {
  try {
    const data = await handlers[envelope.type](envelope.params);
    return { id: envelope.id, ok: true, data };
  } catch (error) {
    return { id: envelope.id, ok: false, error: toBridgeError(error) };
  }
}

export function toBadRequestResponse(
  id: string,
  message: string,
): BridgeResponse {
  return { id, ok: false, error: { code: "BAD_REQUEST", message } };
}
