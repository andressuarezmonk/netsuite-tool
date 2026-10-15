import { useEffect } from "react";
import { ReminderService } from "@/services/reminder.service";
import { dateToISO, getMondayISO } from "@/utils/dates";
import { getWeekTotal } from "@/utils/target";
import { useStore } from "../context/AppContext";

/**
 * Keeps the reminder's hours snapshot up to date. Only the current week is
 * recorded — browsing other weeks must not overwrite it.
 */
export function useHoursSnapshot(weeklyTarget: number) {
  const { weekISO, weekData } = useStore().weekStore.week;

  useEffect(() => {
    if (!weekData) return;
    const currentWeekISO = getMondayISO(dateToISO(new Date()));
    if (weekISO !== currentWeekISO) return;

    ReminderService.setSnapshot({
      weekISO,
      loggedHours: getWeekTotal(weekData.rows),
      weeklyTarget,
      savedAtTimestamp: Date.now(),
    });
  }, [weekISO, weekData, weeklyTarget]);
}
