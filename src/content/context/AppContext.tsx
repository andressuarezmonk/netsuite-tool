import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadInit } from "@/content/utils/api";
import { evictOldWeeks } from "@/content/utils/cache";
import { getMondayISO, todayISO } from "@/content/utils/dates";
import type { TimeRow, WeekData } from "@/content/utils/types";
import {
  StatusKind,
  type StatusEntry,
} from "../components/atoms/StatusBar/StatusBar";
import { useNSDataActions } from "./NSDataContext";
import { createStatusActions } from "../utils/statusActions";
import { StatusId } from "../constants/statusId";
import { useWeekCache } from "../cache/useWeekCache";
import { useRowMutations } from "../hooks/useRowMutations";
import type { DayKey } from "@/content/utils/constants";

export interface AppState {
  weekISO: string;
  weekData: WeekData | null;
  refreshing: boolean;
  statuses: Record<string, StatusEntry>;
  initialized: boolean;
}

export interface AppActions {
  navigate: (mondayISO: string) => void;
  onSave: (
    row: TimeRow,
    dayKey: DayKey,
    hours: number,
    memo: string,
  ) => Promise<void>;
  onDelete: (row: TimeRow) => Promise<void>;
  onAddRow: (row: TimeRow) => void;
  setStatus: (id: string, msg: string, kind: StatusKind) => void;
  clearStatus: (id: string) => void;
}

export const AppStateContext = createContext<AppState | null>(null);
export const AppActionsContext = createContext<AppActions | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
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

  const { setUserId, setDefaultItemId } = useNSDataActions();

  const { setStatus, clearStatus, setTransientStatus } = useMemo(
    () => createStatusActions(setStatuses),
    [],
  );

  const {
    loadWeekWithCache,
    currentWeekDataRef,
    localEditsRef,
    activeWeekRef,
  } = useWeekCache(setWeekData, setRefreshing, { setStatus, clearStatus });

  const { onSave, onDelete } = useRowMutations({
    setWeekData,
    weekISO,
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
        const { userId, defaultItemId } = await loadInit();
        setUserId(userId);
        setDefaultItemId(defaultItemId);
        setInitialized(true);
        clearStatus(StatusId.Init);
        await loadWeekWithCache(weekISO, userId, defaultItemId);
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

  const stateValue = useMemo(
    () => ({ weekISO, weekData, refreshing, statuses, initialized }),
    [weekISO, weekData, refreshing, statuses, initialized],
  );

  const actionsValue = useMemo(
    () => ({ navigate, onSave, onDelete, onAddRow, setStatus, clearStatus }),
    [navigate, onSave, onDelete, onAddRow, setStatus, clearStatus],
  );

  return (
    <AppStateContext.Provider value={stateValue}>
      <AppActionsContext.Provider value={actionsValue}>
        {children}
      </AppActionsContext.Provider>
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used inside AppProvider");
  return ctx;
}

export function useAppActions(): AppActions {
  const ctx = useContext(AppActionsContext);
  if (!ctx) throw new Error("useAppActions must be used inside AppProvider");
  return ctx;
}
