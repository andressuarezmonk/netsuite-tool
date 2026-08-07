import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { DAYS, getNSBaseUrl, type DayKey } from "@/lib/constants";
import { loadInit, loadWeek, saveRow, deleteRow } from "@/lib/api";
import { setCached, evictOldWeeks } from "@/lib/cache";
import { mergeWeekData } from "@/lib/merge";
import { registerSave, waitForRowSave } from "@/lib/rowGate";
import type { TimeRow } from "@/lib/types";
import WeekGrid from "./components/blocks/WeekGrid/WeekGrid";
import WeekNav from "./components/atoms/WeekNav/WeekNav";
import AddRowBar from "./components/blocks/AddRowBar/AddRowBar";
import StatusBar, { StatusKind } from "./components/atoms/StatusBar/StatusBar";
import styles from "./components/App.module.scss";
import { reducer, initialState, APP_ACTION_TYPE } from "./utils/appReducer";
import { AppStateContext, AppActionsContext } from "./context/AppContext";
import { createStatusActions } from "./utils/statusActions";
import { useWeekCache } from "./cache/useWeekCache";

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

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

  // Keep currentWeekDataRef in sync so background merges use the latest data
  useEffect(() => {
    currentWeekDataRef.current = state.weekData;
  }, [state.weekData, currentWeekDataRef]);

  useEffect(() => {
    const initialFetch = async () => {
      try {
        evictOldWeeks();
        await loadInit();
        dispatch({ type: APP_ACTION_TYPE.Initialized });
        clearStatus("init");
        await loadWeekWithCache(state.weekISO);
      } catch (err) {
        setStatus(
          "init",
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

  const onSave = useCallback(
    async (row: TimeRow, dayKey: DayKey, hours: number, memo: string) => {
      const cellKey = `${row.rowKey}_${dayKey}`;
      const editKey = `${row.projId}_${row.taskId}_${dayKey}`;

      if (hours > 0) localEditsRef.current.set(editKey, hours);
      else localEditsRef.current.delete(editKey);

      const existing = saveTimersRef.current.get(cellKey);
      if (existing) clearTimeout(existing);

      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(async () => {
          saveTimersRef.current.delete(cellKey);
          setStatus("mutation", "Saving…", StatusKind.Mutation);

          const savePromise = (async () => {
            await saveRow({
              projId: row.projId,
              projRaw: row.projRaw,
              taskId: row.taskId,
              taskRaw: row.taskRaw,
              itemId: row.itemId,
              weekISO: state.weekISO,
              dayKey,
              hours,
              memo,
              timeid: row.days[dayKey]?.timeid ?? "",
            });
            localEditsRef.current.delete(editKey);
            setTransientStatus("mutation", "✓ Saved", StatusKind.Success);
            const fresh = await loadWeek(state.weekISO);
            await setCached(state.weekISO, fresh);
            dispatch({
              type: APP_ACTION_TYPE.SetData,
              data: mergeWeekData(
                currentWeekDataRef.current ?? fresh,
                fresh,
                localEditsRef.current,
              ),
            });
          })();

          registerSave(row.rowKey, savePromise);

          try {
            await savePromise;
            resolve();
          } catch (err) {
            localEditsRef.current.delete(editKey);
            setTransientStatus(
              "mutation",
              `Save failed: ${(err as Error).message}`,
              StatusKind.Error,
            );
            reject(err);
          }
        }, 400);

        saveTimersRef.current.set(cellKey, timer);
      });
    },
    [
      state.weekISO,
      setStatus,
      setTransientStatus,
      localEditsRef,
      currentWeekDataRef,
    ],
  );

  const onDelete = useCallback(
    async (row: TimeRow) => {
      const timeids = DAYS.map((dk) => row.days[dk]?.timeid ?? "");
      setStatus("mutation", "Deleting…", StatusKind.Mutation);

      for (const [key, timer] of saveTimersRef.current.entries()) {
        if (key.startsWith(row.rowKey)) {
          clearTimeout(timer);
          saveTimersRef.current.delete(key);
        }
      }

      await waitForRowSave(row.rowKey);

      try {
        dispatch({ type: APP_ACTION_TYPE.RemoveRow, rowKey: row.rowKey });
        await deleteRow(timeids);
        setTransientStatus("mutation", "✓ Row deleted", StatusKind.Success);
        const fresh = await loadWeek(state.weekISO);
        await setCached(state.weekISO, fresh);
      } catch (err) {
        setTransientStatus(
          "mutation",
          `Delete failed: ${(err as Error).message}`,
          StatusKind.Error,
        );
        const fresh = await loadWeek(state.weekISO);
        await setCached(state.weekISO, fresh);
        dispatch({
          type: APP_ACTION_TYPE.SetData,
          data: mergeWeekData(
            currentWeekDataRef.current ?? fresh,
            fresh,
            localEditsRef.current,
          ),
        });
      }
    },
    [
      state.weekISO,
      setStatus,
      setTransientStatus,
      currentWeekDataRef,
      localEditsRef,
    ],
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
            Fast Time Tracker · <a href={getNSBaseUrl()}>NetSuite Home</a>
          </footer>
        </div>
      </AppActionsContext.Provider>
    </AppStateContext.Provider>
  );
}
