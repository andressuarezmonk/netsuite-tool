import { useState } from "react";
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

  return { week, setWeek };
}

export type WeekStore = ReturnType<typeof useWeekStore>;
