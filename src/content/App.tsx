import { useCallback, useEffect, useMemo, useState } from "react";
import { loadInit } from "@/content/utils/api";
import { evictOldWeeks } from "@/content/utils/cache";
import { getMondayISO, todayISO } from "@/content/utils/dates";
import type { TimeRow, WeekData } from "@/content/utils/types";
import WeekGrid from "./components/blocks/WeekGrid/WeekGrid";
import WeekNav from "./components/atoms/WeekNav/WeekNav";
import AddRowBar from "./components/blocks/AddRowBar/AddRowBar";
import StatusBar, {
  StatusKind,
  type StatusEntry,
} from "./components/atoms/StatusBar/StatusBar";
import styles from "./components/App.module.scss";
import { AppStateContext, AppActionsContext } from "./context/AppContext";
import { NSDataProvider, useNSDataActions } from "./context/NSDataContext";
import { createStatusActions } from "./utils/statusActions";
import { StatusId } from "./constants/statusId";
import { useWeekCache } from "./cache/useWeekCache";
import { useRowMutations } from "./hooks/useRowMutations";

function AppInner() {
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
        <div className={styles.root}>
          <header className={styles.header}>
            <div>
              <h1>⏱ Weekly Time Entry</h1>
              <p className={styles.subtitle}>NetSuite — fast entry</p>
            </div>
            <button
              className={styles.linkBtn}
              onClick={() => {
                sessionStorage.setItem("ft_bypass", "1");
                window.location.reload();
              }}
            >
              Load original page →
            </button>
          </header>

          <WeekNav />
          <StatusBar />
          <WeekGrid />
          {initialized && <AddRowBar />}

          <footer className={styles.footer}>
            Fast Time Tracker ·{" "}
            <a href={window.location.origin}>NetSuite Home</a>
          </footer>
        </div>
      </AppActionsContext.Provider>
    </AppStateContext.Provider>
  );
}

export default function App() {
  return (
    <NSDataProvider>
      <AppInner />
    </NSDataProvider>
  );
}
