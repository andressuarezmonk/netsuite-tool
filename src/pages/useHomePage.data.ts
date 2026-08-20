import { useCallback, useEffect } from "react";
import { CacheService } from "@/services/cache.service";
import { FetchService } from "@/services/fetch.service";
import { SessionService } from "@/services/session.service";
import type { TimeRow } from "@/utils/types";
import { StatusKind } from "../components/atoms/StatusBar/StatusBar";
import { StatusId } from "../constants/statusId";
import { useWeekCache } from "../hooks/useWeekCache";
import type { WeekStore } from "../context/useWeekStore";
import type { CatalogStore } from "../context/useCatalogStore";
import type { StatusStore } from "../context/useStatusStore";

interface HomePageActions {
  navigate: (mondayISO: string) => void;
  onAddRow: (row: TimeRow) => void;
}

export function useHomePageData(
  weekStore: WeekStore,
  catalogStore: CatalogStore,
  statusStore: StatusStore,
): HomePageActions {
  const { week, setWeek, currentWeekDataRef } = weekStore;
  const { setStatus, clearStatus } = statusStore;

  const { loadWeekWithCache, activeWeekRef } = useWeekCache(
    weekStore,
    catalogStore,
    statusStore,
  );

  // Keep currentWeekDataRef in sync so background merges use the latest data
  useEffect(() => {
    currentWeekDataRef.current = week.weekData;
  }, [week.weekData, currentWeekDataRef]);

  useEffect(() => {
    const initialFetch = async () => {
      try {
        CacheService.evictOldWeeks();
        const data = await FetchService.fetchInitial();
        const freshUserId = String(data.userid ?? "");
        const freshDefaultItemId = String(data.serviceitemtobedefault ?? "754");
        SessionService.set({
          userId: freshUserId,
          defaultItemId: freshDefaultItemId,
        });
        setWeek((prev) => ({ ...prev, initialized: true }));
        clearStatus(StatusId.Init);
        await loadWeekWithCache(week.weekISO, freshUserId, freshDefaultItemId);
      } catch (err) {
        setStatus(
          StatusId.Init,
          `Init failed: ${(err as Error).message}`,
          StatusKind.Error,
        );
      }
    };
    initialFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback(
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
    // setWeek is a stable useState setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadWeekWithCache, activeWeekRef],
  );

  const onAddRow = useCallback((row: TimeRow) => {
    setWeek((prev) =>
      prev.weekData
        ? {
            ...prev,
            weekData: { ...prev.weekData, rows: [...prev.weekData.rows, row] },
          }
        : prev,
    );
    // setWeek is a stable useState setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { navigate, onAddRow };
}
