import { useEffect, useState } from "react";
import { ReminderService } from "@/services/reminder.service";
import {
  DEFAULT_REMINDER_SETTINGS,
  type ReminderSettings,
} from "@/utils/reminder";

export function useReminderSettings() {
  const [settings, setSettings] = useState<ReminderSettings>(
    DEFAULT_REMINDER_SETTINGS,
  );

  useEffect(() => {
    ReminderService.getSettings().then(setSettings);
  }, []);

  const updateSettings = (changes: Partial<ReminderSettings>) => {
    const nextSettings = { ...settings, ...changes };
    setSettings(nextSettings);
    ReminderService.setSettings(nextSettings);
  };

  return { settings, updateSettings };
}
