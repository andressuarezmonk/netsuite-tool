import { useCallback, useEffect, useMemo, useState } from "react";
import { loadInit } from "@/content/utils/api";
import { evictOldWeeks } from "@/content/utils/cache";
import { getMondayISO, todayISO } from "@/content/utils/dates";
import type { TimeRow, WeekData, Project, Task } from "@/content/utils/types";
import {
  StatusKind,
  type StatusEntry,
} from "../components/atoms/StatusBar/StatusBar";
import { createStatusActions } from "../utils/statusActions";
import { StatusId } from "../constants/statusId";
import { useWeekCache } from "../cache/useWeekCache";
import { useRowMutations } from "./useRowMutations";
import type { AppStore } from "../context/AppContext";

export function useHomePageState(): AppStore {
  const [userId, setUserId] = useState("");
  const [defaultItemId, setDefaultItemId] = useState("754");
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});

  const [weekISO, setWeekISO] = useState(getMondayISO(todayISO()));
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, StatusEntry>>({
    [StatusId.Init]: {
      id: StatusId.Init,
      msg: "Initializing…",
      kind: StatusKind.Fetch,
    },
  });

  const { setStatus, clearStatus, setTransientStatus } = useMemo(
    () => createStatusActions(setStatuses),
    [],
  );

  const {
    loadWeekWithCache,
    currentWeekDataRef,
    localEditsRef,
    activeWeekRef,
  } = useWeekCache(setWeekData, setRefreshing, setProjects, setTasks, {
    setStatus,
    clearStatus,
  });

  const { onSave, onDelete } = useRowMutations({
    setWeekData,
    weekISO,
    userId,
    defaultItemId,
    statusActions: { setStatus, setTransientStatus },
    currentWeekDataRef,
    localEditsRef,
  });

  // Keep currentWeekDataRef in sync so background merges use the latest data
  useEffect(() => {
    currentWeekDataRef.current = weekData;
  }, [weekData, currentWeekDataRef]);

  useEffect(() => {
    const initialFetch = async () => {
      try {
        evictOldWeeks();
        const { userId: freshUserId, defaultItemId: freshDefaultItemId } =
          await loadInit();
        setUserId(freshUserId);
        setDefaultItemId(freshDefaultItemId);
        setInitialized(true);
        clearStatus(StatusId.Init);
        await loadWeekWithCache(weekISO, freshUserId, freshDefaultItemId);
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
      setWeekISO(mondayISO);
      setWeekData(null);
      setRefreshing(false);
      loadWeekWithCache(mondayISO);
    },
    [loadWeekWithCache, activeWeekRef],
  );

  const onAddRow = useCallback((row: TimeRow) => {
    setWeekData((prev) =>
      prev ? { ...prev, rows: [...prev.rows, row] } : prev,
    );
  }, []);

  return useMemo(
    () => ({
      userId,
      defaultItemId,
      projects,
      tasks,
      weekISO,
      weekData,
      refreshing,
      statuses,
      initialized,
      navigate,
      onSave,
      onDelete,
      onAddRow,
      setStatus,
      clearStatus,
    }),
    [
      userId,
      defaultItemId,
      projects,
      tasks,
      weekISO,
      weekData,
      refreshing,
      statuses,
      initialized,
      navigate,
      onSave,
      onDelete,
      onAddRow,
      setStatus,
      clearStatus,
    ],
  );
}
