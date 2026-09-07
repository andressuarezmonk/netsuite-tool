import { useCallback, useRef } from "react";
import { DAYS, type DayKey } from "@/utils/constants";
import { loadWeek } from "@/services/week.service";
import { RowService } from "@/services/row.service";
import { CacheService } from "@/services/cache.service";
import { SessionService } from "@/services/session.service";
import { mergeWeekData } from "@/utils/merge";
import { createKeyedAsyncDebounce } from "@/utils/debouncedAsync";
import type { TimeRow, WeekData } from "@/utils/types";
import { StatusKind } from "../constants/statusKind";
import { StatusId } from "../constants/statusId";
import type { WeekStore } from "../context/useWeekStore";
import type { StatusStore } from "../context/useStatusStore";

// Tracks in-flight save promises keyed by rowKey so deletes never race
// against a save that hasn't completed yet.

function registerSave(
  pendingSaves: Map<string, Promise<void>>,
  rowKey: string,
  promise: Promise<void>,
): void {
  pendingSaves.set(rowKey, promise);
  promise.finally(() => {
    if (pendingSaves.get(rowKey) === promise) {
      pendingSaves.delete(rowKey);
    }
  });
}

async function waitForPendingSave(
  pendingSaves: Map<string, Promise<void>>,
  rowKey: string,
): Promise<void> {
  const pending = pendingSaves.get(rowKey);
  if (!pending) return;
  try {
    await pending;
  } catch {
    // Swallow — the save handler already reported the error to the user
  }
}

async function refreshWeekFromServer(
  weekISO: string,
  userId: string,
  defaultItemId: string,
): Promise<WeekData> {
  const { weekData: fresh } = await loadWeek(weekISO, userId, defaultItemId);
  await CacheService.setCached(weekISO, fresh);
  return fresh;
}

// Tracks the current batch of concurrent onSave calls so the status bar can
// show live "completed/total" progress. A batch starts with the first save
// after the previous one fully settled, and resets to zero once every save
// in it has completed (success or failure).
interface SaveBatch {
  total: number;
  completed: number;
  errors: number;
}

function createSaveBatchTracker() {
  let batch: SaveBatch = { total: 0, completed: 0, errors: 0 };

  function start(): SaveBatch {
    if (batch.total === batch.completed) {
      batch = { total: 0, completed: 0, errors: 0 };
    }
    batch.total += 1;
    return batch;
  }

  function finish(didError: boolean): SaveBatch {
    batch.completed += 1;
    if (didError) batch.errors += 1;
    return batch;
  }

  return { start, finish };
}

function formatSaveProgressMessage(batch: SaveBatch): string {
  return batch.total > 1
    ? `Saving… ${batch.completed}/${batch.total}`
    : "Saving…";
}

function formatSaveErrorMessage(errorCount: number): string {
  return errorCount > 1 ? `Save failed (${errorCount})` : "Save failed";
}

interface UseRowMutations {
  weekStore: WeekStore;
  statusStore: StatusStore;
  weekISO: string;
}

export interface RowMutations {
  onSave: (
    row: TimeRow,
    dayKey: DayKey,
    hours: number,
    memo: string,
  ) => Promise<void>;
  onDelete: (row: TimeRow) => Promise<void>;
}

export function useRowMutations({
  weekStore,
  statusStore,
  weekISO,
}: UseRowMutations): RowMutations {
  const { setWeek, currentWeekDataRef, localEditsRef, pendingSavesRef } =
    weekStore;
  const { setStatus, clearStatus, setTransientStatus } = statusStore;
  const { userId, defaultItemId } = SessionService.get();

  const setWeekData = useCallback(
    (
      weekDataOrUpdater:
        WeekData | ((prev: WeekData | null) => WeekData | null),
    ) => {
      setWeek((prev) => ({
        ...prev,
        weekData:
          typeof weekDataOrUpdater === "function"
            ? weekDataOrUpdater(prev.weekData)
            : weekDataOrUpdater,
      }));
    },
    [setWeek],
  );

  // Merges freshly-fetched week data with any edits the user made while the
  // fetch was in flight, so a slow refresh can't clobber unsaved keystrokes.
  const mergeFreshWeekData = useCallback(
    (fresh: WeekData) => {
      setWeekData(
        mergeWeekData(
          currentWeekDataRef.current ?? fresh,
          fresh,
          localEditsRef.current,
        ),
      );
    },
    [setWeekData, currentWeekDataRef, localEditsRef],
  );

  // Per-cell debounce timers: "rowKey_dayKey" → timer handle
  const { debounce, cancelByPrefix } = useRef(
    createKeyedAsyncDebounce(),
  ).current;
  // Tracks the current batch of concurrent onSave calls for progress display
  const saveBatch = useRef(createSaveBatchTracker()).current;

  const reportSaveBatchStatus = useCallback(
    (batch: SaveBatch) => {
      if (batch.completed < batch.total) {
        setStatus(
          StatusId.Mutation,
          formatSaveProgressMessage(batch),
          StatusKind.Mutation,
        );
        return;
      }
      // Batch fully settled — only flash success if nothing in it failed
      if (batch.errors === 0) {
        setTransientStatus(StatusId.Mutation, "✓ Saved", StatusKind.Success);
      } else {
        clearStatus(StatusId.Mutation);
      }
    },
    [setStatus, setTransientStatus, clearStatus],
  );

  const onSave = useCallback(
    async (row: TimeRow, dayKey: DayKey, hours: number, memo: string) => {
      const cellKey = `${row.rowKey}_${dayKey}`;
      const editKey = `${row.projId}_${row.taskId}_${dayKey}`;

      // Track local edit immediately so background refreshes don't overwrite it
      if (hours > 0) localEditsRef.current.set(editKey, hours);
      else localEditsRef.current.delete(editKey);

      const startedBatch = saveBatch.start();
      setStatus(
        StatusId.Mutation,
        formatSaveProgressMessage(startedBatch),
        StatusKind.Mutation,
      );

      const savePromise = debounce(cellKey, 400, async () => {
        await RowService.saveRow(
          {
            projRaw: row.projRaw,
            taskId: row.taskId,
            taskRaw: row.taskRaw,
            itemId: row.itemId,
            weekISO,
            dayKey,
            hours,
            memo,
            timeid: row.days[dayKey]?.timeid ?? "",
          },
          userId,
          defaultItemId,
        );
        localEditsRef.current.delete(editKey);
        mergeFreshWeekData(
          await refreshWeekFromServer(weekISO, userId, defaultItemId),
        );
      });

      // Register so any delete on this row waits for us to finish
      registerSave(pendingSavesRef.current, row.rowKey, savePromise);

      try {
        await savePromise;
        reportSaveBatchStatus(saveBatch.finish(false));
      } catch (err) {
        localEditsRef.current.delete(editKey);
        const finishedBatch = saveBatch.finish(true);
        setTransientStatus(
          StatusId.MutationError,
          formatSaveErrorMessage(finishedBatch.errors),
          StatusKind.Error,
        );
        reportSaveBatchStatus(finishedBatch);
        throw err;
      }
    },
    [
      weekISO,
      setStatus,
      setTransientStatus,
      mergeFreshWeekData,
      reportSaveBatchStatus,
      localEditsRef,
      userId,
      defaultItemId,
      debounce,
      pendingSavesRef,
      saveBatch,
    ],
  );

  const onDelete = useCallback(
    async (row: TimeRow) => {
      const timeids = DAYS.map((dk) => row.days[dk]?.timeid ?? "");
      setStatus(StatusId.Mutation, "Deleting…", StatusKind.Mutation);

      // Cancel any pending debounced saves for cells in this row
      cancelByPrefix(row.rowKey);

      // Wait for any in-flight save to settle before deleting
      await waitForPendingSave(pendingSavesRef.current, row.rowKey);

      try {
        // Optimistically remove the row from UI while the delete is in flight
        setWeekData({
          ...(currentWeekDataRef.current ?? { rows: [], weekStart: weekISO }),
          rows: (currentWeekDataRef.current?.rows ?? []).filter(
            (r) => r.rowKey !== row.rowKey,
          ),
        });
        await RowService.deleteRow(timeids);
        setTransientStatus(
          StatusId.Mutation,
          "✓ Row deleted",
          StatusKind.Success,
        );
        setWeekData(
          await refreshWeekFromServer(weekISO, userId, defaultItemId),
        );
      } catch (err) {
        setTransientStatus(
          StatusId.Mutation,
          `Delete failed: ${(err as Error).message}`,
          StatusKind.Error,
        );
        mergeFreshWeekData(
          await refreshWeekFromServer(weekISO, userId, defaultItemId),
        );
      }
    },
    [
      setStatus,
      cancelByPrefix,
      setWeekData,
      currentWeekDataRef,
      weekISO,
      setTransientStatus,
      userId,
      defaultItemId,
      mergeFreshWeekData,
      pendingSavesRef,
    ],
  );

  return { onSave, onDelete };
}
