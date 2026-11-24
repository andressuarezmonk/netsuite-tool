import { useCallback } from "react";
import type { WeekStore } from "@/context/useWeekStore";
import type { WeekCacheHandle } from "./useWeekCache";

export function useNavigation(
  weekStore: WeekStore,
  weekCacheHandle: WeekCacheHandle,
): (mondayISO: string) => void {
  const { setWeek } = weekStore;
  const { loadWeekWithCache, activeWeekRef } = weekCacheHandle;

  return useCallback(
    (mondayISO: string) => {
      activeWeekRef.current = mondayISO;
      setWeek((prev) => ({
        ...prev,
        weekISO: mondayISO,
        weekData: null,
        refreshing: false,
      }));
      loadWeekWithCache(mondayISO);
    },
    [loadWeekWithCache, activeWeekRef, setWeek],
  );
}
