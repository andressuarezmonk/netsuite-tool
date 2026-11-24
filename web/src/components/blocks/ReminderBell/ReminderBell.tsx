import { useEffect, useRef, useState } from "react";
import { DAYS, type DayKey } from "@/utils/days";
import { useReminderSettings } from "@/hooks/useReminderSettings";
import bellOnSvg from "./bell-on.svg?raw";
import bellOffSvg from "./bell-off.svg?raw";
import s from "./ReminderBell.module.scss";

const TEST_MESSAGE_TYPE = "ft_test_reminder";
const TEST_FEEDBACK_MS = 2000;

const formatDayLabel = (dayKey: DayKey) =>
  dayKey.charAt(0).toUpperCase() + dayKey.slice(1);

export default function ReminderBell() {
  const { settings, updateSettings } = useReminderSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const toggleDay = (dayKey: DayKey) => {
    const nextDays = settings.days.includes(dayKey)
      ? settings.days.filter((selectedDay) => selectedDay !== dayKey)
      : DAYS.filter((day) => day === dayKey || settings.days.includes(day));
    updateSettings({ days: nextDays });
  };

  const sendTestReminder = () => {
    chrome.runtime.sendMessage({ type: TEST_MESSAGE_TYPE });
    setTestSent(true);
    window.setTimeout(() => setTestSent(false), TEST_FEEDBACK_MS);
  };

  return (
    <div className={s.container} ref={containerRef}>
      <button
        type="button"
        className={s.bellButton}
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
        aria-label="Hours reminder settings"
        aria-expanded={isOpen}
        title={settings.enabled ? "Reminders on" : "Reminders off"}
      >
        <span
          className={s.bellIcon}
          aria-hidden="true"
          dangerouslySetInnerHTML={{
            __html: settings.enabled ? bellOnSvg : bellOffSvg,
          }}
        />
        {settings.enabled && <span className={s.activeDot} />}
      </button>

      {isOpen && (
        <div className={s.popover} role="dialog" aria-label="Reminder settings">
          <label className={s.enableRow}>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) =>
                updateSettings({ enabled: event.target.checked })
              }
            />
            <span>Remind me to log my hours</span>
          </label>

          <fieldset className={s.options} disabled={!settings.enabled}>
            <div className={s.group}>
              <span className={s.groupLabel}>Days</span>
              <div className={s.days}>
                {DAYS.map((dayKey) => (
                  <button
                    key={dayKey}
                    type="button"
                    className={`${s.dayChip}${settings.days.includes(dayKey) ? ` ${s.dayChipActive}` : ""}`}
                    aria-pressed={settings.days.includes(dayKey)}
                    onClick={() => toggleDay(dayKey)}
                  >
                    {formatDayLabel(dayKey)}
                  </button>
                ))}
              </div>
            </div>

            <div className={s.group}>
              <label className={s.groupLabel} htmlFor="reminder-time">
                Time
              </label>
              <input
                id="reminder-time"
                type="time"
                className={s.timeInput}
                value={settings.time}
                onChange={(event) => {
                  if (event.target.value) {
                    updateSettings({ time: event.target.value });
                  }
                }}
              />
            </div>

            <div className={s.group}>
              <span className={s.groupLabel}>Show in notification</span>
              <label className={s.checkRow}>
                <input
                  type="checkbox"
                  checked={settings.showLogged}
                  onChange={(event) =>
                    updateSettings({ showLogged: event.target.checked })
                  }
                />
                <span>Hours logged</span>
              </label>
              <label className={s.checkRow}>
                <input
                  type="checkbox"
                  checked={settings.showTarget}
                  onChange={(event) =>
                    updateSettings({ showTarget: event.target.checked })
                  }
                />
                <span>Weekly target</span>
              </label>
            </div>
          </fieldset>

          <p className={s.note}>
            Stays silent once you've reached your weekly target. Hours are as of
            the last time you used this page.
          </p>

          <button
            type="button"
            className={s.testButton}
            onClick={sendTestReminder}
          >
            {testSent ? "Sent ✓" : "Send test notification"}
          </button>
        </div>
      )}
    </div>
  );
}
