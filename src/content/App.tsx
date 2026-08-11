import { useCallback, useEffect, useMemo, useReducer } from "react";
import { loadInit } from "@/content/utils/api";
import { evictOldWeeks } from "@/content/utils/cache";
import type { TimeRow } from "@/content/utils/types";
import WeekGrid from "./components/blocks/WeekGrid/WeekGrid";
import WeekNav from "./components/atoms/WeekNav/WeekNav";
import AddRowBar from "./components/blocks/AddRowBar/AddRowBar";
import StatusBar, { StatusKind } from "./components/atoms/StatusBar/StatusBar";
import styles from "./components/App.module.scss";
import { reducer, initialState, APP_ACTION_TYPE } from "./utils/appReducer";
import { AppStateContext, AppActionsContext } from "./context/AppContext";
import { NSDataProvider, useNSDataActions } from "./context/NSDataContext";
import { createStatusActions } from "./utils/statusActions";
import { StatusId } from "./constants/statusId";
import { useWeekCache } from "./cache/useWeekCache";
import { useRowMutations } from "./hooks/useRowMutations";

function AppInner() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { setUserId, setDefaultItemId } = useNSDataActions();

  const { setStatus, clearStatus, setTransientStatus } = useMemo(
    () => createStatusActions(dispatch),
    [],
  );

  const {
    loadWeekWithCache,
    currentWeekDataRef,
    localEditsRef,
    activeWeekRef,
  } = useWeekCache(dispatch, { setStatus, clearStatus });

  const { onSave, onDelete } = useRowMutations({
    dispatch,
    weekISO: state.weekISO,
    statusActions: { setStatus, setTransientStatus },
    currentWeekDataRef,
    localEditsRef,
  });

  // Keep currentWeekDataRef in sync so background merges use the latest data
  useEffect(() => {
    currentWeekDataRef.current = state.weekData;
  }, [state.weekData, currentWeekDataRef]);

  useEffect(() => {
    const initialFetch = async () => {
      try {
        evictOldWeeks();
        const { userId, defaultItemId } = await loadInit();
        setUserId(userId);
        setDefaultItemId(defaultItemId);
        dispatch({ type: APP_ACTION_TYPE.Initialized });
        clearStatus(StatusId.Init);
        await loadWeekWithCache(state.weekISO, userId, defaultItemId);
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
      dispatch({ type: APP_ACTION_TYPE.SetWeek, weekISO: mondayISO });
      loadWeekWithCache(mondayISO);
    },
    [loadWeekWithCache, activeWeekRef],
  );

  const onAddRow = useCallback((row: TimeRow) => {
    dispatch({ type: APP_ACTION_TYPE.AddRow, row });
  }, []);

  const stateValue = useMemo(
    () => ({
      weekISO: state.weekISO,
      weekData: state.weekData,
      refreshing: state.refreshing,
      statuses: state.statuses,
      initialized: state.initialized,
    }),
    [state],
  );

  const actionsValue = useMemo(
    () => ({
      dispatch,
      navigate,
      onSave,
      onDelete,
      onAddRow,
      setStatus,
      clearStatus,
    }),
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
          {state.initialized && <AddRowBar />}

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
