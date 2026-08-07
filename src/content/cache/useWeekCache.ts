import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
} from "react";
import { getMondayISO, todayISO } from "@/lib/dates";
import { loadWeek } from "@/lib/api";
import { getCached, setCached } from "@/lib/cache";
import { mergeWeekData } from "@/lib/merge";
import type { WeekData } from "@/lib/types";
import type { Action } from "../utils/appReducer";
import { APP_ACTION_TYPE } from "../constants/appActionType";
import { StatusKind } from "../constants/statusKind";

type StatusActions = {
  setStatus: (id: string, msg: string, kind: StatusKind) => void;
  clearStatus: (id: string) => void;
};

export interface WeekCacheHandle {
  /** Load a week with cache-first strategy, background refresh, and stale-request guard. */
  loadWeekWithCache: (mondayISO: string) => Promise<void>;
  /** The currently displayed WeekData — write into this after state changes so
   *  merges during background refresh use the latest data. */
  currentWeekDataRef: MutableRefObject<WeekData | null>;
  /** Unsaved local edits map — updated by save/delete handlers before they call the API. */
  localEditsRef: MutableRefObject<Map<string, number>>;
  /** The week the user is currently viewing — cancels stale in-flight fetches on navigation. */
  activeWeekRef: MutableRefObject<string>;
}

export function useWeekCache(
  dispatch: Dispatch<Action>,
  statusActions: StatusActions,
): WeekCacheHandle {
  const { setStatus, clearStatus } = statusActions;

  const currentWeekDataRef = useRef<WeekData | null>(null);
  const localEditsRef = useRef<Map<string, number>>(new Map());
  const activeWeekRef = useRef<string>(getMondayISO(todayISO()));

  const loadWeekWithCache = useCallback(
    async (mondayISO: string) => {
      activeWeekRef.current = mondayISO;
      localEditsRef.current = new Map();

      const cached = await getCached(mondayISO);
      if (activeWeekRef.current !== mondayISO) return;

      if (cached) {
        dispatch({
          type: APP_ACTION_TYPE.SetData,
          data: cached,
          refreshing: true,
        });
        setStatus("cache", "Loaded from cache — refreshing…", StatusKind.Cache);
      } else {
        setStatus("fetch", "Loading week data…", StatusKind.Fetch);
      }

      try {
        const fresh = await loadWeek(mondayISO);
        if (activeWeekRef.current !== mondayISO) {
          await setCached(mondayISO, fresh);
          return;
        }
        await setCached(mondayISO, fresh);
        const displayed = currentWeekDataRef.current;
        const merged = displayed
          ? mergeWeekData(displayed, fresh, localEditsRef.current)
          : fresh;
        dispatch({
          type: APP_ACTION_TYPE.SetData,
          data: merged,
          refreshing: false,
        });
        clearStatus("cache");
        clearStatus("fetch");
      } catch (err) {
        if (activeWeekRef.current !== mondayISO) return;
        if (!cached) {
          setStatus(
            "fetch",
            `Failed to load: ${(err as Error).message}`,
            StatusKind.Error,
          );
        } else {
          setStatus("cache", "⚠ Refresh failed", StatusKind.Error);
          dispatch({ type: APP_ACTION_TYPE.SetRefreshing, value: false });
        }
      }
    },
    [dispatch, setStatus, clearStatus],
  );

  return {
    loadWeekWithCache,
    currentWeekDataRef,
    localEditsRef,
    activeWeekRef,
  };
}
