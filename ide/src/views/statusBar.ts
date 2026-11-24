import * as vscode from "vscode";
import {
  WEEKLY_TARGET_HOURS,
  buildDaySummaries,
  formatHours,
  getWeekTotalHours,
} from "@/model/weekModel";
import type { ViewState, WeekStore } from "@/state/weekStore";
import { todayISO } from "@/utils/dates";

const HIDDEN_STATES: readonly ViewState[] = [
  "notPaired",
  "waiting",
  "portInUse",
  "incompatible",
  "sessionExpired",
  "notConfigured",
];

/** "$(clock) 6h today · 32h/40h" — always about the real current week. */
export function createStatusBar(store: WeekStore): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(
    "netsuiteTracker.status",
    vscode.StatusBarAlignment.Left,
    50,
  );
  item.name = "NetSuite Time";
  item.command = "netsuiteTracker.week.focus";

  const update = () => {
    const { currentWeek, viewState } = store;
    if (!currentWeek || HIDDEN_STATES.includes(viewState)) {
      item.hide();
      return;
    }
    const today = todayISO();
    const days = buildDaySummaries(currentWeek, today);
    const todayHours = days.find((day) => day.dateISO === today)?.totalHours;
    const weekHours = getWeekTotalHours(days);

    const weekPart = `${formatHours(weekHours)}/${WEEKLY_TARGET_HOURS}h`;
    item.text =
      todayHours === undefined
        ? `$(clock) ${weekPart}`
        : `$(clock) ${formatHours(todayHours)} today · ${weekPart}`;
    item.tooltip = "NetSuite hours — click to open the week view";
    item.show();
  };

  update();
  const subscription = store.onDidChange(update);
  return vscode.Disposable.from(item, subscription);
}
