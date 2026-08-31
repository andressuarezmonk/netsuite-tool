import { ApiClient, BASE_URL, getHandlerParams } from "./apiClient.service";
import type { NSApprovalStatus, NSRejectedStatus } from "../constants/nsEnums";

export const FetchEndpoints = {
  Initial: `${BASE_URL}?opType=fetch&requestType=init`,
  Week: `${BASE_URL}?opType=fetch&requestType=time`,
};

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
  rejected: NSRejectedStatus;
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
}

// ── Requests ──────────────────────────────────────────────────────────────────

export const fetchInitial = async (): Promise<NSInitialResponse> => {
  const { scriptId, deployId } = getHandlerParams();
  const response = await ApiClient.get<NSInitialResponse>(
    FetchEndpoints.Initial,
    {
      params: { script: scriptId, deploy: deployId },
    },
  );
  return response.data;
};

const fetchWeek = async (
  weekNS: string,
  employeeId: string,
): Promise<NSWeekResponse> => {
  const { scriptId, deployId } = getHandlerParams();
  const response = await ApiClient.get<NSWeekResponse>(FetchEndpoints.Week, {
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
