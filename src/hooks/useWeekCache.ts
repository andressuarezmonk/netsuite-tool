import { useCallback, useRef, type MutableRefObject } from "react";
import { getMondayISO, todayISO } from "@/utils/dates";
import { CacheService } from "@/services/cache.service";
import { SessionService } from "@/services/session.service";
import { StatusKind } from "../constants/statusKind";
import { StatusId } from "../constants/statusId";
import type { WeekStore } from "../context/useWeekStore";
import type { CatalogStore } from "../context/useCatalogStore";
import type { StatusStore } from "../context/useStatusStore";
import type { WeekData } from "@/utils/types";

export interface WeekCacheHandle {
  loadWeekWithCache: (
    mondayISO: string,
    freshUserId?: string,
    freshDefaultItemId?: string,
  ) => Promise<void>;
  activeWeekRef: MutableRefObject<string>;
}

export function useWeekCache(
  weekStore: WeekStore,
  catalogStore: CatalogStore,
  statusStore: StatusStore,
): WeekCacheHandle {
  const { setWeek, currentWeekDataRef, localEditsRef } = weekStore;
  const { setCatalog } = catalogStore;
  const { setStatus, clearStatus } = statusStore;

  const activeWeekRef = useRef<string>(getMondayISO(todayISO()));

  const setWeekDataFromCache = useCallback(
    (newWeekData: WeekData) => {
      setWeek((prev) => ({
        ...prev,
        weekData: newWeekData,
        refreshing: true,
      }));
      setStatus(
        StatusId.Cache,
        "Loaded from cache — refreshing…",
        StatusKind.Cache,
      );
    },
    [setStatus, setWeek],
  );

  const fetchAndRefreshLastWeekData = useCallback(
    async (
      getCacheIsStale: () => boolean,
      mondayISO: string,
      resolvedUserId: string,
      resolvedDefaultItemId: string,
    ) => {
      const weekSnapshot = await CacheService.fetchAndCacheWeek(
        mondayISO,
        resolvedUserId,
        resolvedDefaultItemId,
        currentWeekDataRef.current,
        localEditsRef.current,
      );

      if (getCacheIsStale()) return;

      setCatalog({
        projects: weekSnapshot.projects,
        tasks: weekSnapshot.tasks,
      });
      setWeek((prev) => ({
        ...prev,
        weekData: weekSnapshot.merged,
        refreshing: false,
      }));
      clearStatus(StatusId.Cache);
      clearStatus(StatusId.Fetch);
    },
    [clearStatus, setCatalog, setWeek, currentWeekDataRef, localEditsRef],
  );

  const showFetchErrorWithNoPreviousCache = useCallback(
    (err: unknown) => {
      setStatus(
        StatusId.Fetch,
        `Failed to load: ${(err as Error).message}`,
        StatusKind.Error,
      );
    },
    [setStatus],
  );

  const showFetchErrorWithPreviousCache = useCallback(() => {
    setStatus(StatusId.Cache, "⚠ Refresh failed", StatusKind.Error);
    setWeek((prev) => ({ ...prev, refreshing: false }));
  }, [setStatus, setWeek]);

  const loadWeekWithCache = useCallback(
    async (
      mondayISO: string,
      freshUserId?: string,
      freshDefaultItemId?: string,
    ) => {
      const resolvedUserId = freshUserId ?? SessionService.get().userId;
      const resolvedDefaultItemId =
        freshDefaultItemId ?? SessionService.get().defaultItemId;
      const getCacheIsStale = () => activeWeekRef.current !== mondayISO;

      activeWeekRef.current = mondayISO;
      localEditsRef.current = new Map();

      const cachedWeekData = await CacheService.getCached(mondayISO);
      if (getCacheIsStale()) return;

      if (cachedWeekData) {
        setWeekDataFromCache(cachedWeekData);
      } else {
        setStatus(StatusId.Fetch, "Loading week data…", StatusKind.Fetch);
      }

      try {
        await fetchAndRefreshLastWeekData(
          getCacheIsStale,
          mondayISO,
          resolvedUserId,
          resolvedDefaultItemId,
        );
      } catch (err) {
        if (getCacheIsStale()) return;

        if (!cachedWeekData) {
          // No previous cache existed
          showFetchErrorWithNoPreviousCache(err);
        } else {
          // Previous cache did exist
          showFetchErrorWithPreviousCache();
        }
      }
    },
    [
      localEditsRef,
      setStatus,
      setWeekDataFromCache,
      fetchAndRefreshLastWeekData,
      showFetchErrorWithPreviousCache,
      showFetchErrorWithNoPreviousCache,
    ],
  );

  return { loadWeekWithCache, activeWeekRef };
}
