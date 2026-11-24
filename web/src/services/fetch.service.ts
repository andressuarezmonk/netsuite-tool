import { ApiClient, resolveHandlerRequest } from "./apiClient.service";
import type { NSApprovalStatus, NSSubmittedStatus } from "../constants/nsEnums";

const QUERY_INITIAL = "opType=fetch&requestType=init";
const QUERY_WEEK = "opType=fetch&requestType=time";

// ── Response types ────────────────────────────────────────────────────────────

interface NSRawProject {
  internalid: string; // e.g. "123|ProjectName"
  display: string;
}

interface NSRawTimeEntry {
  hours: string; // e.g. "6:30"
  memo: string;
  internalid: string; // timeid
  approval: NSApprovalStatus;
  rejected: NSSubmittedStatus;
  disableLine: boolean;
}

export interface NSInitialResponse {
  userid: string | number;
  serviceitemtobedefault: string | number;
}

export interface NSWeekResponse {
  projectsorig: NSRawProject[];
  projecttasksorig: Record<string, NSRawProject[]>;
  // keyed as "projId_taskId_itemId", each value is an array of
  // objects keyed by NS date string ("M/D/YYYY") → time entry
  timeentries: Record<string, Array<Record<string, NSRawTimeEntry>>>;
  // company-wide holiday calendar, not scoped to the requested week —
  // each entry is keyed by a JS Date.toString()-style date → holiday name
  holidays: Array<Record<string, string>>;
}

// ── Requests ──────────────────────────────────────────────────────────────────

export const fetchInitial = async (): Promise<NSInitialResponse> => {
  const { url, scriptId, deployId } =
    await resolveHandlerRequest(QUERY_INITIAL);
  const response = await ApiClient.get<NSInitialResponse>(url, {
    params: { script: scriptId, deploy: deployId },
  });
  return response.data;
};

const fetchWeek = async (
  weekNS: string,
  employeeId: string,
): Promise<NSWeekResponse> => {
  const { url, scriptId, deployId } = await resolveHandlerRequest(QUERY_WEEK);
  const response = await ApiClient.get<NSWeekResponse>(url, {
    params: {
      script: scriptId,
      deploy: deployId,
      week: weekNS,
      employee: employeeId,
    },
  });
  return response.data;
};

export const FetchService = { fetchInitial, fetchWeek };
