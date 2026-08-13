import { useRef, useState } from "react";
import { getMondayISO, todayISO } from "@/utils/dates";
import type { WeekData, Project, Task } from "@/utils/types";
import {
  StatusKind,
  type StatusEntry,
} from "../components/atoms/StatusBar/StatusBar";
import { StatusId } from "../constants/statusId";

export interface Session {
  userId: string;
  defaultItemId: string;
}

export interface Week {
  weekISO: string;
  weekData: WeekData | null;
  refreshing: boolean;
  initialized: boolean;
}

export interface Catalog {
  projects: Project[];
  tasks: Record<string, Task[]>;
}

export function useStore() {
  const [session, setSession] = useState<Session>({
    userId: "",
    defaultItemId: "754",
  });

  const [week, setWeek] = useState<Week>({
    weekISO: getMondayISO(todayISO()),
    weekData: null,
    refreshing: false,
    initialized: false,
  });

  const [catalog, setCatalog] = useState<Catalog>({
    projects: [],
    tasks: {},
  });

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
    session,
    setSession,
    week,
    setWeek,
    catalog,
    setCatalog,
    statuses,
    setStatus,
    clearStatus,
    setTransientStatus,
  };
}

export type Store = ReturnType<typeof useStore>;
