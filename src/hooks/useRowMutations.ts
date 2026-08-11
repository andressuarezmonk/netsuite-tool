import { useCallback, useRef, type MutableRefObject } from "react";
import { DAYS, type DayKey } from "@/utils/constants";
import { loadWeek } from "@/services/week.service";
import { saveRow, deleteRow } from "@/services/row.service";
import { setCached } from "@/utils/cache";
import { mergeWeekData } from "@/utils/merge";
import type { TimeRow, WeekData } from "@/utils/types";
import { StatusKind } from "../constants/statusKind";
import { StatusId } from "../constants/statusId";
import { createKeyedDebounce } from "../utils/keyedDebounce";
import type { Store } from "../context/useStore";

// ── Row gate ──────────────────────────────────────────────────────────────────
// Tracks in-flight save promises keyed by rowKey so deletes never race
// against a save that hasn't completed yet.

const pendingSaves = new Map<string, Promise<void>>();

function registerSave(rowKey: string, promise: Promise<void>): void {
  pendingSaves.set(rowKey, promise);
  promise.finally(() => {
    if (pendingSaves.get(rowKey) === promise) {
      pendingSaves.delete(rowKey);
    }
  });
}

async function waitForPendingSave(rowKey: string): Promise<void> {
  const pending = pendingSaves.get(rowKey);
  if (!pending) return;
  try {
    await pending;
  } catch {
    // Swallow — the save handler already reported the error to the user
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface Params {
  store: Store;
  weekISO: string;
  currentWeekDataRef: MutableRefObject<WeekData | null>;
  localEditsRef: MutableRefObject<Map<string, number>>;
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
  store,
  weekISO,
  currentWeekDataRef,
  localEditsRef,
}: Params): RowMutations {
  const { userId, defaultItemId, setWeekData, setStatus, setTransientStatus } =
    store;

  // Per-cell debounce timers: "rowKey_dayKey" → timer handle
  const saveDebounce = useRef(createKeyedDebounce()).current;

  const onSave = useCallback(
    async (row: TimeRow, dayKey: DayKey, hours: number, memo: string) => {
      const cellKey = `${row.rowKey}_${dayKey}`;
      const editKey = `${row.projId}_${row.taskId}_${dayKey}`;

      // Track local edit immediately so background refreshes don't overwrite it
      if (hours > 0) localEditsRef.current.set(editKey, hours);
      else localEditsRef.current.delete(editKey);

      // Debounce: cancel any pending save for this cell and restart the timer
      return new Promise<void>((resolve, reject) => {
        saveDebounce.debounce(cellKey, 400, async () => {
          setStatus(StatusId.Mutation, "Saving…", StatusKind.Mutation);

          const savePromise = (async () => {
            await saveRow(
              {
                projId: row.projId,
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
            const { weekData: fresh } = await loadWeek(
              weekISO,
              userId,
              defaultItemId,
            );
            await setCached(weekISO, fresh);
            setWeekData(
              mergeWeekData(
                currentWeekDataRef.current ?? fresh,
                fresh,
                localEditsRef.current,
              ),
            );
            setTransientStatus(
              StatusId.Mutation,
              "✓ Saved",
              StatusKind.Success,
            );
          })();

          // Register so any delete on this row waits for us to finish
          registerSave(row.rowKey, savePromise);

          try {
            await savePromise;
            resolve();
          } catch (err) {
            localEditsRef.current.delete(editKey);
            setTransientStatus(
              StatusId.Mutation,
              `Save failed: ${(err as Error).message}`,
              StatusKind.Error,
            );
            reject(err);
          }
        });
      });
    },
    [
      weekISO,
      setStatus,
      setTransientStatus,
      setWeekData,
      currentWeekDataRef,
      localEditsRef,
      saveDebounce,
      userId,
      defaultItemId,
    ],
  );

  const onDelete = useCallback(
    async (row: TimeRow) => {
      const timeids = DAYS.map((dk) => row.days[dk]?.timeid ?? "");
      setStatus(StatusId.Mutation, "Deleting…", StatusKind.Mutation);

      // Cancel any pending debounced saves for cells in this row
      saveDebounce.cancelByPrefix(row.rowKey);

      // Wait for any in-flight save to settle before deleting
      await waitForPendingSave(row.rowKey);

      try {
        // Optimistically remove the row from UI while the delete is in flight
        setWeekData({
          ...(currentWeekDataRef.current ?? { rows: [], weekStart: weekISO }),
          rows: (currentWeekDataRef.current?.rows ?? []).filter(
            (r) => r.rowKey !== row.rowKey,
          ),
        });
        await deleteRow(timeids);
        setTransientStatus(
          StatusId.Mutation,
          "✓ Row deleted",
          StatusKind.Success,
        );
        const { weekData: fresh } = await loadWeek(
          weekISO,
          userId,
          defaultItemId,
        );
        await setCached(weekISO, fresh);
        setWeekData(fresh);
      } catch (err) {
        setTransientStatus(
          StatusId.Mutation,
          `Delete failed: ${(err as Error).message}`,
          StatusKind.Error,
        );
        const { weekData: fresh } = await loadWeek(
          weekISO,
          userId,
          defaultItemId,
        );
        await setCached(weekISO, fresh);
        setWeekData(
          mergeWeekData(
            currentWeekDataRef.current ?? fresh,
            fresh,
            localEditsRef.current,
          ),
        );
      }
    },
    [
      weekISO,
      setStatus,
      setTransientStatus,
      setWeekData,
      currentWeekDataRef,
      localEditsRef,
      saveDebounce,
      userId,
      defaultItemId,
    ],
  );

  return { onSave, onDelete };
}
