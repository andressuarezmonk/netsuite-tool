import { useCallback } from "react";
import { addDays, getMondayISO } from "@/utils/dates";
import { DAYS } from "@/utils/constants";
import { loadWeek } from "@/services/week.service";
import { RowService } from "@/services/row.service";
import { CacheService } from "@/services/cache.service";
import { SessionService } from "@/services/session.service";
import { StatusKind } from "@/constants/statusKind";
import { StatusId } from "@/constants/statusId";
import type { WeekStore } from "@/context/useWeekStore";
import type { StatusStore } from "@/context/useStatusStore";

interface UseWeekCopy {
  weekStore: WeekStore;
  statusStore: StatusStore;
  weekISO: string;
}

export interface WeekCopy {
  onCopyPreviousWeek: () => Promise<void>;
}

export function useWeekCopy({
  weekStore,
  statusStore,
  weekISO,
}: UseWeekCopy): WeekCopy {
  const { setWeek, currentWeekDataRef } = weekStore;
  const { setStatus, setTransientStatus, clearStatus } = statusStore;
  const { userId, defaultItemId } = SessionService.get();

  const onCopyPreviousWeek = useCallback(async () => {
    // ── Step 1: Load previous week data (read-only, no side effects yet) ──────
    const previousMondayISO = getMondayISO(addDays(weekISO, -7));

    setStatus(StatusId.Mutation, "Loading previous week…", StatusKind.Fetch);

    let previousRows;
    try {
      const { weekData: previousWeekData } = await loadWeek(
        previousMondayISO,
        userId,
        defaultItemId,
      );
      previousRows = previousWeekData.rows;
    } catch (err) {
      setTransientStatus(
        StatusId.Mutation,
        `Failed to load previous week: ${(err as Error).message}`,
        StatusKind.Error,
      );
      return;
    }

    // Copy all cells with hours > 0, regardless of approval or submission
    // status — we are creating fresh unapproved records in the current week.
    // The only cells we skip are `disabled` ones, which are locked at the NS
    // level and would fail on save.
    const copyableRows = previousRows
      .map((row) => ({
        ...row,
        days: Object.fromEntries(
          Object.entries(row.days).filter(
            ([, entry]) => entry.hours > 0 && !entry.disabled,
          ),
        ) as typeof row.days,
      }))
      .filter((row) => Object.keys(row.days).length > 0);

    if (copyableRows.length === 0) {
      setTransientStatus(
        StatusId.Mutation,
        "Previous week has no copyable entries.",
        StatusKind.Error,
      );
      return;
    }

    // ── Step 2: Confirm with the user ─────────────────────────────────────────
    const currentRows = currentWeekDataRef.current?.rows ?? [];
    const savedCurrentRows = currentRows.filter((row) =>
      DAYS.some((dk) => (row.days[dk]?.timeid ?? "") !== ""),
    );

    const confirmMessage = [
      `This will replace the current week with ${copyableRows.length} row(s) from last week.`,
      savedCurrentRows.length > 0
        ? `${savedCurrentRows.length} existing row(s) will be permanently deleted.`
        : null,
      "This action cannot be undone.",
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!confirm(confirmMessage)) {
      clearStatus(StatusId.Mutation);
      return;
    }

    // ── Step 3: Delete all current week rows sequentially ─────────────────────
    if (savedCurrentRows.length > 0) {
      setStatus(
        StatusId.Mutation,
        `Deleting ${savedCurrentRows.length} existing row(s)…`,
        StatusKind.Mutation,
      );

      for (const row of savedCurrentRows) {
        const timeids = DAYS.map((dk) => row.days[dk]?.timeid ?? "");
        try {
          await RowService.deleteRow(timeids);
        } catch (err) {
          setTransientStatus(
            StatusId.Mutation,
            `Delete failed: ${(err as Error).message}`,
            StatusKind.Error,
          );
          // Re-fetch to restore a consistent view before bailing
          try {
            const { weekData: fresh } = await loadWeek(
              weekISO,
              userId,
              defaultItemId,
            );
            await CacheService.setCached(weekISO, fresh);
            setWeek((prev) => ({ ...prev, weekData: fresh }));
          } catch {
            // Best-effort — ignore secondary fetch error
          }
          return;
        }
      }
    }

    // Optimistically clear the week in the UI while saves are in progress
    setWeek((prev) => ({
      ...prev,
      weekData: { rows: [], weekStart: weekISO },
    }));

    // ── Step 4: Save each copyable row / day sequentially ─────────────────────
    const totalCells = copyableRows.reduce(
      (sum, row) => sum + Object.keys(row.days).length,
      0,
    );
    let savedCells = 0;

    for (const row of copyableRows) {
      for (const dayKey of DAYS) {
        const entry = row.days[dayKey];
        if (!entry) continue;

        savedCells += 1;
        setStatus(
          StatusId.Mutation,
          `Copying… (${savedCells}/${totalCells})`,
          StatusKind.Mutation,
        );

        try {
          await RowService.saveRow(
            {
              projRaw: row.projRaw,
              taskId: row.taskId,
              taskRaw: row.taskRaw,
              itemId: row.itemId,
              weekISO,
              dayKey,
              hours: entry.hours,
              memo: entry.memo,
              // Always empty — we are creating new records in the current week,
              // not updating last week's entries.
              timeid: "",
            },
            userId,
            defaultItemId,
          );
        } catch (err) {
          setTransientStatus(
            StatusId.Mutation,
            `Copy failed at row "${row.projName} — ${row.taskName}": ${(err as Error).message}`,
            StatusKind.Error,
          );
          // Re-fetch to surface whatever was partially saved
          try {
            const { weekData: fresh } = await loadWeek(
              weekISO,
              userId,
              defaultItemId,
            );
            await CacheService.setCached(weekISO, fresh);
            setWeek((prev) => ({ ...prev, weekData: fresh }));
          } catch {
            // Best-effort
          }
          return;
        }
      }
    }

    // ── Step 5: Re-fetch the current week for the canonical server state ───────
    setStatus(
      StatusId.Mutation,
      "Re-fetching for consistency...",
      StatusKind.Mutation,
    );
    try {
      const { weekData: fresh } = await loadWeek(
        weekISO,
        userId,
        defaultItemId,
      );
      await CacheService.setCached(weekISO, fresh);
      setWeek((prev) => ({ ...prev, weekData: fresh }));
      setTransientStatus(
        StatusId.Mutation,
        `✓ Copied ${copyableRows.length} row(s) from last week`,
        StatusKind.Success,
      );
    } catch (err) {
      setTransientStatus(
        StatusId.Mutation,
        `Copy complete but refresh failed: ${(err as Error).message}`,
        StatusKind.Error,
      );
    }
  }, [
    weekISO,
    userId,
    defaultItemId,
    setStatus,
    setTransientStatus,
    clearStatus,
    setWeek,
    currentWeekDataRef,
  ]);

  return { onCopyPreviousWeek };
}
