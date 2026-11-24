import { useRef, useState } from "react";
import { getMondayISO, todayISO } from "@/utils/dates";
import type { WeekData } from "@/utils/types";

export interface Week {
  weekISO: string;
  weekData: WeekData | null;
  refreshing: boolean;
  initialized: boolean;
}

export function useWeekStore() {
  const [week, setWeek] = useState<Week>({
    weekISO: getMondayISO(todayISO()),
    weekData: null,
    refreshing: false,
    initialized: false,
  });

  // Shared refs used by useWeekCache and useRowMutations to coordinate
  // background refreshes with in-flight saves and local edits.
  const currentWeekDataRef = useRef<WeekData | null>(null);
  const localEditsRef = useRef<Map<string, number>>(new Map());
  // Tracks in-flight save promises keyed by rowKey so deletes never race
  // against a save that hasn't completed yet. Lives here (not inside
  // useRowMutations) so all hook instances share the same Map.
  const pendingSavesRef = useRef<Map<string, Promise<void>>>(new Map());

  return { week, setWeek, currentWeekDataRef, localEditsRef, pendingSavesRef };
}

export type WeekStore = ReturnType<typeof useWeekStore>;
