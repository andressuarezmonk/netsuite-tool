import { useCallback, useRef, type MutableRefObject } from "react";
import { getMondayISO, todayISO } from "@/content/utils/dates";
import { loadWeek } from "@/content/utils/api";
import { getCached, setCached } from "@/content/utils/cache";
import { mergeWeekData } from "@/content/utils/merge";
import { useNSData, useNSDataActions } from "@/content/context/NSDataContext";
import type { WeekData } from "@/content/utils/types";
import { StatusKind } from "../constants/statusKind";
import { StatusId } from "../constants/statusId";

type SetWeekData = (data: WeekData | null) => void;
type SetRefreshing = (value: boolean) => void;

type StatusActions = {
  setStatus: (id: string, msg: string, kind: StatusKind) => void;
  clearStatus: (id: string) => void;
};

export interface WeekCacheHandle {
  /** Load a week with cache-first strategy, background refresh, and stale-request guard. */
  loadWeekWithCache: (
    mondayISO: string,
    userId?: string,
    defaultItemId?: string,
  ) => Promise<void>;
  /** The currently displayed WeekData — write into this after state changes so
   *  merges during background refresh use the latest data. */
  currentWeekDataRef: MutableRefObject<WeekData | null>;
  /** Unsaved local edits map — updated by save/delete handlers before they call the API. */
  localEditsRef: MutableRefObject<Map<string, number>>;
  /** The week the user is currently viewing — cancels stale in-flight fetches on navigation. */
  activeWeekRef: MutableRefObject<string>;
}

export function useWeekCache(
  setWeekData: SetWeekData,
  setRefreshing: SetRefreshing,
  statusActions: StatusActions,
): WeekCacheHandle {
  const { setStatus, clearStatus } = statusActions;
  const { userId, defaultItemId } = useNSData();
  const { setProjects, setTasks } = useNSDataActions();

  const currentWeekDataRef = useRef<WeekData | null>(null);
  const localEditsRef = useRef<Map<string, number>>(new Map());
  const activeWeekRef = useRef<string>(getMondayISO(todayISO()));

  const loadWeekWithCache = useCallback(
    async (
      mondayISO: string,
      freshUserId?: string,
      freshDefaultItemId?: string,
    ) => {
      // Use passed-in values if provided (e.g. right after init before context re-renders),
      // otherwise fall back to context state for subsequent navigations.
      const resolvedUserId = freshUserId ?? userId;
      const resolvedDefaultItemId = freshDefaultItemId ?? defaultItemId;

      activeWeekRef.current = mondayISO;
      localEditsRef.current = new Map();

      const cached = await getCached(mondayISO);
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
        const {
          weekData: fresh,
          projects,
          tasks,
        } = await loadWeek(mondayISO, resolvedUserId, resolvedDefaultItemId);
        if (activeWeekRef.current !== mondayISO) {
          await setCached(mondayISO, fresh);
          return;
        }
        await setCached(mondayISO, fresh);
        setProjects(projects);
        setTasks(tasks);
        const displayed = currentWeekDataRef.current;
        const merged = displayed
          ? mergeWeekData(displayed, fresh, localEditsRef.current)
          : fresh;
        setWeekData(merged);
        setRefreshing(false);
        clearStatus(StatusId.Cache);
        clearStatus(StatusId.Fetch);
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
      setStatus,
      clearStatus,
      userId,
      defaultItemId,
      setProjects,
      setTasks,
    ],
  );

  return {
    loadWeekWithCache,
    currentWeekDataRef,
    localEditsRef,
    activeWeekRef,
  };
}
