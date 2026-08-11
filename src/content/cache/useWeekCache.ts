import { useCallback, useRef, type MutableRefObject } from "react";
import { getMondayISO, todayISO } from "@/content/utils/dates";
import { loadWeek } from "@/content/utils/api";
import { getCached, setCached } from "@/content/utils/cache";
import { mergeWeekData } from "@/content/utils/merge";
import type { WeekData, Project, Task } from "@/content/utils/types";
import { StatusKind } from "../constants/statusKind";
import { StatusId } from "../constants/statusId";

type SetWeekData = (data: WeekData | null) => void;
type SetRefreshing = (value: boolean) => void;
type SetProjects = (projects: Project[]) => void;
type SetTasks = (tasks: Record<string, Task[]>) => void;

type StatusActions = {
  setStatus: (id: string, msg: string, kind: StatusKind) => void;
  clearStatus: (id: string) => void;
};

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

export function useWeekCache(
  setWeekData: SetWeekData,
  setRefreshing: SetRefreshing,
  setProjects: SetProjects,
  setTasks: SetTasks,
  statusActions: StatusActions,
): WeekCacheHandle {
  const { setStatus, clearStatus } = statusActions;

  const currentWeekDataRef = useRef<WeekData | null>(null);
  const localEditsRef = useRef<Map<string, number>>(new Map());
  const activeWeekRef = useRef<string>(getMondayISO(todayISO()));

  // userId and defaultItemId are passed in directly on first load to avoid
  // the React state timing issue — state updates are async so context values
  // won't be available yet immediately after setUserId/setDefaultItemId.
  const loadWeekWithCache = useCallback(
    async (mondayISO: string, userId = "", defaultItemId = "754") => {
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
        } = await loadWeek(mondayISO, userId, defaultItemId);
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
    [setWeekData, setRefreshing, setProjects, setTasks, setStatus, clearStatus],
  );

  return {
    loadWeekWithCache,
    currentWeekDataRef,
    localEditsRef,
    activeWeekRef,
  };
}
