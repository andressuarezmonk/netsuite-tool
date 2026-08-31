import { useCallback } from "react";
import { useStore } from "@/context/AppContext";

export function useNavigation(): (mondayISO: string) => void {
  const {
    weekStore: { setWeek },
    weekCacheHandle: { loadWeekWithCache, activeWeekRef },
  } = useStore();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadWeekWithCache, activeWeekRef],
  );
}
