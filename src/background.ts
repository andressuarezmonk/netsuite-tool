// Background service worker — fires the opt-in "missing time" reminder.
//
// A single chrome.alarms alarm always points at the next selected day/time.
// When it fires we read the hours snapshot written by the tracker page, show
// a notification unless the weekly target is already met, and schedule the next.

import {
  ReminderService,
  STORAGE_KEY_REMINDER_SETTINGS,
} from "@/services/reminder.service";
import {
  buildReminderNotification,
  getNextReminderTime,
} from "@/utils/reminder";

const ALARM_NAME = "ft_hours_reminder";
const NOTIFICATION_ID = "ft_hours_reminder";
const TEST_MESSAGE_TYPE = "ft_test_reminder";
// A reminder that fires this long after its slot (browser was closed) is skipped.
const MAX_LATE_MS = 2 * 60 * 60 * 1000;

async function scheduleNextReminder(): Promise<void> {
  await chrome.alarms.clear(ALARM_NAME);
  const settings = await ReminderService.getSettings();
  const nextReminderTime = getNextReminderTime(settings, new Date());
  if (nextReminderTime !== null) {
    chrome.alarms.create(ALARM_NAME, { when: nextReminderTime });
  }
}

async function showReminder(forceShow: boolean): Promise<void> {
  const [settings, snapshot] = await Promise.all([
    ReminderService.getSettings(),
    ReminderService.getSnapshot(),
  ]);
  const notification = buildReminderNotification(
    settings,
    snapshot,
    new Date(),
    forceShow,
  );
  if (!notification) return;

  chrome.notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: notification.title,
    message: notification.message,
    contextMessage: notification.contextMessage,
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const isTooLate = Date.now() - alarm.scheduledTime > MAX_LATE_MS;
  if (!isTooLate) await showReminder(false);
  await scheduleNextReminder();
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId !== NOTIFICATION_ID) return;
  const storageResult = await chrome.storage.local.get("lastNsUrl");
  const trackerUrl = storageResult.lastNsUrl as string | undefined;
  if (trackerUrl) await chrome.tabs.create({ url: trackerUrl });
  chrome.notifications.clear(notificationId);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && STORAGE_KEY_REMINDER_SETTINGS in changes) {
    scheduleNextReminder();
  }
});

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message.type === TEST_MESSAGE_TYPE) showReminder(true);
});

chrome.runtime.onInstalled.addListener(() => {
  scheduleNextReminder();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleNextReminder();
});
