import { useEffect } from "react";
import { AppContext } from "../context/AppContext";
import { useWeekStore } from "../context/useWeekStore";
import { useCatalogStore } from "../context/useCatalogStore";
import { useStatusStore } from "../context/useStatusStore";
import { useWeekCache } from "../hooks/useWeekCache";
import { useRowMutations } from "../hooks/useRowMutations";
import { CacheService } from "@/services/cache.service";
import { FetchService } from "@/services/fetch.service";
import { SessionService } from "@/services/session.service";
import { StatusKind } from "@/constants/statusKind";
import { StatusId } from "../constants/statusId";
import { DEFAULT_ITEM_ID } from "@/constants/nsEnums";
import HomePage from "./HomePage";

export default function HomePageProvider() {
  const weekStore = useWeekStore();
  const catalogStore = useCatalogStore();
  const statusStore = useStatusStore();
  const weekCacheHandle = useWeekCache(weekStore, catalogStore, statusStore);
  const { onSave, onDelete } = useRowMutations({
    weekStore,
    statusStore,
    weekISO: weekStore.week.weekISO,
  });

  const { currentWeekDataRef, week, setWeek } = weekStore;
  const { setStatus, clearStatus } = statusStore;
  const { loadWeekWithCache } = weekCacheHandle;

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
        const freshDefaultItemId = String(
          data.serviceitemtobedefault ?? DEFAULT_ITEM_ID,
        );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- week.weekISO is intentionally excluded; this effect must run once on mount only
  }, [clearStatus, loadWeekWithCache, setStatus, setWeek]);

  return (
    <AppContext.Provider
      value={{
        weekStore,
        catalogStore,
        statusStore,
        weekCacheHandle,
        onSave,
        onDelete,
      }}
    >
      <HomePage />
    </AppContext.Provider>
  );
}
