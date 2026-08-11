import { useCallback, useEffect } from "react";
import { loadInit } from "@/content/utils/api";
import { evictOldWeeks } from "@/content/utils/cache";
import type { TimeRow } from "@/content/utils/types";
import { StatusKind } from "../components/atoms/StatusBar/StatusBar";
import { StatusId } from "../constants/statusId";
import { useWeekCache } from "../cache/useWeekCache";
import { useRowMutations, type RowMutations } from "../hooks/useRowMutations";
import type { Store } from "../context/useStore";

interface HomePageActions {
  navigate: (mondayISO: string) => void;
  onSave: RowMutations["onSave"];
  onDelete: RowMutations["onDelete"];
  onAddRow: (row: TimeRow) => void;
}

export function useHomePageData(store: Store): HomePageActions {
  const {
    weekISO,
    weekData,
    setUserId,
    setDefaultItemId,
    setInitialized,
    setWeekISO,
    setWeekData,
    setRefreshing,
    setStatus,
    clearStatus,
  } = store;

  const {
    loadWeekWithCache,
    currentWeekDataRef,
    localEditsRef,
    activeWeekRef,
  } = useWeekCache(store);

  const { onSave, onDelete } = useRowMutations({
    store,
    weekISO,
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
    // setWeekISO, setWeekData, setRefreshing are stable useState setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadWeekWithCache, activeWeekRef],
  );

  const onAddRow = useCallback((row: TimeRow) => {
    setWeekData((prev: typeof weekData) =>
      prev ? { ...prev, rows: [...prev.rows, row] } : prev,
    );
    // setWeekData is a stable useState setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { navigate, onSave, onDelete, onAddRow };
}
