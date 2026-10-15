/**
 * Pure logic for the opt-in "missing time" reminder: when the next reminder
 * is due and what it says. Safe to import from the background service worker
 * (no `window` access).
 */

import { DAYS, type DayKey } from "./days";
import { dateToISO, formatHours, getMondayISO } from "./dates";

export interface ReminderSettings {
  enabled: boolean;
  days: DayKey[];
  /** Local time of day, "HH:MM" (24h). */
  time: string;
  showLogged: boolean;
  showTarget: boolean;
}

/** Last known hours for the current week, written by the tracker page. */
export interface HoursSnapshot {
  weekISO: string;
  loggedHours: number;
  weeklyTarget: number;
  savedAtTimestamp: number;
}

export interface ReminderNotification {
  title: string;
  message: string;
  contextMessage: string;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  days: ["fri"],
  time: "16:00",
  showLogged: true,
  showTarget: true,
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Tolerance so 39.999… vs 40 doesn't read as "still under". */
const HOURS_EPSILON = 0.01;

export function isValidTime(time: string): boolean {
  return TIME_PATTERN.test(time);
}

/** Timestamp (ms) of the next selected day/time strictly after `now`, or null. */
export function getNextReminderTime(
  settings: ReminderSettings,
  now: Date,
): number | null {
  if (!settings.enabled || settings.days.length === 0) return null;
  const timeMatch = TIME_PATTERN.exec(settings.time);
  if (!timeMatch) return null;
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);

  // 0..7 covers "later today" through "same weekday next week".
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + dayOffset);
    candidate.setHours(hours, minutes, 0, 0);
    // JS getDay(): 0 = Sunday; DAYS starts on Monday.
    const candidateDayKey = DAYS[(candidate.getDay() + 6) % 7];
    const isAfterNow = candidate.getTime() > now.getTime();
    if (isAfterNow && settings.days.includes(candidateDayKey)) {
      return candidate.getTime();
    }
  }
  return null;
}

function formatSyncTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Builds the notification text, or null when the reminder should stay silent
 * (the snapshot shows the current week's target is already met).
 * `forceShow` skips the silence rule — used by the "send test" button.
 */
export function buildReminderNotification(
  settings: ReminderSettings,
  snapshot: HoursSnapshot | null,
  now: Date,
  forceShow = false,
): ReminderNotification | null {
  const currentWeekISO = getMondayISO(dateToISO(now));
  const title = "Time to log your hours";

  if (!snapshot || snapshot.weekISO !== currentWeekISO) {
    return {
      title,
      message: "Don't forget to log your hours this week.",
      contextMessage: "Open the tracker to sync this week's hours",
    };
  }

  const { loggedHours, weeklyTarget } = snapshot;
  const isTargetMet = loggedHours >= weeklyTarget - HOURS_EPSILON;
  if (isTargetMet && !forceShow) return null;

  const logged = `${formatHours(loggedHours)}h`;
  const target = `${formatHours(weeklyTarget)}h`;
  let message = "Don't forget to log your hours this week.";
  if (settings.showLogged && settings.showTarget) {
    message = `${logged} / ${target} logged this week`;
  } else if (settings.showLogged) {
    message = `${logged} logged this week`;
  } else if (settings.showTarget) {
    message = `Weekly target: ${target}`;
  }

  return {
    title,
    message,
    contextMessage: `Last synced ${formatSyncTime(snapshot.savedAtTimestamp)}`,
  };
}
