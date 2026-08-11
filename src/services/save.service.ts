import { ApiClient, BASE_URL } from "./apiClient.service";
import type { DayKey } from "@/content/utils/constants";

export const SaveEndpoints = {
  Row: `${BASE_URL}?opType=saveAll`,
};

// ── Request types ─────────────────────────────────────────────────────────────

interface NSSaveRowLine {
  day: DayKey;
  date: string; // "M/D/YYYY"
  time: string; // "H:MM"
  memo: string;
  timeid: string;
}

interface NSSaveRowBlock {
  emp: string;
  proj: string;
  projtask: string;
  item: string;
  isbillable: boolean;
  class: null;
  location: null;
  department: null;
  rate: string;
  blockid: number;
  lines: NSSaveRowLine[];
}

// ── Response types ────────────────────────────────────────────────────────────

interface NSSaveRowResponseItem {
  errors: string;
  created: string[];
  updated: string[];
}

export type NSSaveRowResponse = NSSaveRowResponseItem[];

// ── Requests ──────────────────────────────────────────────────────────────────

export const saveRow = async (
  scriptId: string,
  deployId: string,
  block: NSSaveRowBlock,
): Promise<NSSaveRowResponse> => {
  const response = await ApiClient.post<NSSaveRowResponse>(
    SaveEndpoints.Row,
    new URLSearchParams({
      script: scriptId,
      deploy: deployId,
      payLoad: JSON.stringify([block]),
    }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
    },
  );
  return response.data;
};

export const SaveService = { saveRow };
