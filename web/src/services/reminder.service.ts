/**
 * Persists the reminder settings and the hours snapshot in chrome.storage.local.
 * chrome.storage (not localStorage) is used because the background service
 * worker — which fires the reminders — has no access to the page's localStorage.
 */

import { DAYS } from "@/utils/days";
import {
  DEFAULT_REMINDER_SETTINGS,
  isValidTime,
  type HoursSnapshot,
  type ReminderSettings,
} from "@/utils/reminder";
import { ChromeStorage } from "./chromeStorage.service";

export const STORAGE_KEY_REMINDER_SETTINGS = "reminder_settings";
const STORAGE_KEY_HOURS_SNAPSHOT = "hours_snapshot";

function sanitizeSettings(stored: Partial<ReminderSettings>): ReminderSettings {
  const defaults = DEFAULT_REMINDER_SETTINGS;
  return {
    enabled: stored.enabled === true,
    days: Array.isArray(stored.days)
      ? DAYS.filter((dayKey) => stored.days?.includes(dayKey))
      : defaults.days,
    time:
      typeof stored.time === "string" && isValidTime(stored.time)
        ? stored.time
        : defaults.time,
    showLogged:
      typeof stored.showLogged === "boolean"
        ? stored.showLogged
        : defaults.showLogged,
    showTarget:
      typeof stored.showTarget === "boolean"
        ? stored.showTarget
        : defaults.showTarget,
  };
}

export const ReminderService = {
  async getSettings(): Promise<ReminderSettings> {
    const storageResult = await ChromeStorage.storageGet(
      STORAGE_KEY_REMINDER_SETTINGS,
    );
    const stored = storageResult[STORAGE_KEY_REMINDER_SETTINGS] as
      Partial<ReminderSettings> | undefined;
    return stored ? sanitizeSettings(stored) : DEFAULT_REMINDER_SETTINGS;
  },

  async setSettings(settings: ReminderSettings): Promise<void> {
    await ChromeStorage.storageSet({
      [STORAGE_KEY_REMINDER_SETTINGS]: settings,
    });
  },

  async getSnapshot(): Promise<HoursSnapshot | null> {
    const storageResult = await ChromeStorage.storageGet(
      STORAGE_KEY_HOURS_SNAPSHOT,
    );
    const stored = storageResult[STORAGE_KEY_HOURS_SNAPSHOT] as
      HoursSnapshot | undefined;
    return stored ?? null;
  },

  async setSnapshot(snapshot: HoursSnapshot): Promise<void> {
    await ChromeStorage.storageSet({ [STORAGE_KEY_HOURS_SNAPSHOT]: snapshot });
  },
};
