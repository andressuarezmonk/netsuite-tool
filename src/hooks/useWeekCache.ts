import { useCallback, useRef, type MutableRefObject } from "react";
import { getMondayISO, todayISO } from "@/utils/dates";
import { CacheService } from "@/services/cache.service";
import type { WeekData } from "@/utils/types";
import { StatusKind } from "../constants/statusKind";
import { StatusId } from "../constants/statusId";
import type { Store } from "../context/useStore";

export interface WeekCacheHandle {
  loadWeekWithCache: (
    mondayISO: string,
    userId?: string,
    defaultItemId?: string,
  ) => Promise<void>;
  currentWeekDataRef: MutableRefObject<WeekData | null>;
  localEditsRef: MutableRefObject<Map<string, number>>;
  activeWeekRef: MutableRefObject<string>;
}

export function useWeekCache(store: Store): WeekCacheHandle {
  const {
    setWeekData,
    setRefreshing,
    setProjects,
    setTasks,
    setStatus,
    clearStatus,
    userId,
    defaultItemId,
  } = store;

  const currentWeekDataRef = useRef<WeekData | null>(null);
  const localEditsRef = useRef<Map<string, number>>(new Map());
  const activeWeekRef = useRef<string>(getMondayISO(todayISO()));

  // freshUserId/freshDefaultItemId are passed in on first load to bypass the
  // React state timing issue — on subsequent navigations the store values are used.
  const loadWeekWithCache = useCallback(
    async (
      mondayISO: string,
      freshUserId?: string,
      freshDefaultItemId?: string,
    ) => {
      const resolvedUserId = freshUserId ?? userId;
      const resolvedDefaultItemId = freshDefaultItemId ?? defaultItemId;
      activeWeekRef.current = mondayISO;
      localEditsRef.current = new Map();

      const cached = await CacheService.getCached(mondayISO);
      if (activeWeekRef.current !== mondayISO) return;

      if (cached) {
        setWeekData(cached);
        setRefreshing(true);
        setStatus(
          StatusId.Cache,
          "Loaded from cache — refreshing…",
          StatusKind.Cache,
        );
      } else {
        setStatus(StatusId.Fetch, "Loading week data…", StatusKind.Fetch);
      }

      try {
        const { fresh, merged, projects, tasks } =
          await CacheService.fetchAndCacheWeek(
            mondayISO,
            resolvedUserId,
            resolvedDefaultItemId,
            currentWeekDataRef.current,
            localEditsRef.current,
          );

        if (activeWeekRef.current !== mondayISO) return;

        setProjects(projects);
        setTasks(tasks);
        setWeekData(merged);
        setRefreshing(false);
        clearStatus(StatusId.Cache);
        clearStatus(StatusId.Fetch);

        // If navigation happened while fetching, still persist the fresh data
        if (activeWeekRef.current !== mondayISO) {
          await CacheService.setCached(mondayISO, fresh);
        }
      } catch (err) {
        if (activeWeekRef.current !== mondayISO) return;
        if (!cached) {
          setStatus(
            StatusId.Fetch,
            `Failed to load: ${(err as Error).message}`,
            StatusKind.Error,
          );
        } else {
          setStatus(StatusId.Cache, "⚠ Refresh failed", StatusKind.Error);
          setRefreshing(false);
        }
      }
    },
    [
      setWeekData,
      setRefreshing,
      setProjects,
      setTasks,
      setStatus,
      clearStatus,
      userId,
      defaultItemId,
    ],
  );

  return {
    loadWeekWithCache,
    currentWeekDataRef,
    localEditsRef,
    activeWeekRef,
  };
}
