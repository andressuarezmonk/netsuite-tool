import { useRef, useState } from "react";
import { getMondayISO, todayISO } from "@/content/utils/dates";
import type { WeekData, Project, Task } from "@/content/utils/types";
import {
  StatusKind,
  type StatusEntry,
} from "../components/atoms/StatusBar/StatusBar";
import { StatusId } from "../constants/statusId";

export function useStore() {
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

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStatus = (id: string, msg: string, kind: StatusKind) => {
    setStatuses((prev) => ({ ...prev, [id]: { id, msg, kind } }));
  };

  const clearStatus = (id: string) => {
    setStatuses((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const setTransientStatus = (
    id: string,
    msg: string,
    kind: StatusKind,
    ms = 2500,
  ) => {
    setStatuses((prev) => ({ ...prev, [id]: { id, msg, kind } }));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setStatuses((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, ms);
  };

  return {
    // State
    userId,
    setUserId,
    defaultItemId,
    setDefaultItemId,
    projects,
    setProjects,
    tasks,
    setTasks,
    weekISO,
    setWeekISO,
    weekData,
    setWeekData,
    refreshing,
    setRefreshing,
    initialized,
    setInitialized,
    statuses,

    // Status helpers
    setStatus,
    clearStatus,
    setTransientStatus,
  };
}

export type Store = ReturnType<typeof useStore>;
