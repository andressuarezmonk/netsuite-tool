import React, { useRef, useState, useEffect } from "react";
import { DAYS, type DayKey } from "@/lib/constants";
import { addDays, formatHours, todayISO } from "@/lib/dates";
import type { WeekData, TimeRow } from "@/lib/types";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  weekData: WeekData | null;
  weekISO: string;
  onSave: (
    row: TimeRow,
    dayKey: DayKey,
    hours: number,
    memo: string,
  ) => Promise<void>;
  onDelete: (row: TimeRow) => Promise<void>;
}

export default function WeekGrid({
  weekData,
  weekISO,
  onSave,
  onDelete,
}: Props) {
  const today = todayISO();
  const dayDates = DAYS.map((_, i) => addDays(weekISO, i));

  if (!weekData) {
    return null; // StatusBar already shows "Loading…" — no duplicate message needed
  }

  return (
    <div className="ft-grid-wrap">
      <table className="ft-table">
        <thead>
          <tr>
            <th className="ft-col-proj">Project</th>
            <th className="ft-col-task">Task</th>
            {DAYS.map((_, i) => (
              <th
                key={DAYS[i]}
                className={`ft-col-day${dayDates[i] === today ? " ft-today" : ""}`}
              >
                {DAY_LABELS[i]}
                <span className="ft-day-date">
                  {dayDates[i].slice(5).replace("-", "/")}
                </span>
              </th>
            ))}
            <th className="ft-col-total">Total</th>
            <th className="ft-col-del" />
          </tr>
        </thead>
        <tbody>
          {weekData.rows.length === 0 ? (
            <tr>
              <td colSpan={DAYS.length + 3} className="ft-empty-row">
                No entries this week. Add a row below.
              </td>
            </tr>
          ) : (
            weekData.rows.map((row) => (
              <TimeRowComponent
                key={`${row.projId}_${row.taskId}`}
                row={row}
                dayDates={dayDates}
                today={today}
                onSave={onSave}
                onDelete={onDelete}
              />
            ))
          )}
        </tbody>
        <tfoot>
          <DayTotals rows={weekData.rows} dayDates={dayDates} today={today} />
        </tfoot>
      </table>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  row: TimeRow;
  dayDates: string[];
  today: string;
  onSave: Props["onSave"];
  onDelete: Props["onDelete"];
}

function TimeRowComponent({
  row,
  dayDates,
  today,
  onSave,
  onDelete,
}: RowProps) {
  const rowTotal = DAYS.reduce((s, dk) => s + (row.days[dk]?.hours ?? 0), 0);
  const [deleting, setDeleting] = React.useState(false);

  // Disable delete if any day is approved
  const hasApproved = DAYS.some((dk) => row.days[dk]?.approved);

  const handleDelete = async () => {
    if (
      !confirm(
        `Remove row "${row.projName} — ${row.taskName}"? This will delete all saved time entries in this row.`,
      )
    )
      return;
    setDeleting(true);
    try {
      await onDelete(row);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <tr>
      <td className="ft-col-proj" title={row.projId}>
        {row.projName}
      </td>
      <td className="ft-col-task" title={row.taskId}>
        {row.taskName || "—"}
      </td>
      {DAYS.map((dk, i) => (
        <DayCell
          key={dk}
          row={row}
          dayKey={dk}
          isToday={dayDates[i] === today}
          onSave={onSave}
        />
      ))}
      <td className="ft-col-total">{rowTotal ? formatHours(rowTotal) : ""}</td>
      <td className="ft-col-del">
        <button
          className="ft-del-btn"
          onClick={handleDelete}
          disabled={deleting || hasApproved}
          title={
            hasApproved
              ? "Cannot delete — row has approved entries"
              : "Remove this row"
          }
        >
          {deleting ? "…" : "×"}
        </button>
      </td>
    </tr>
  );
}

// ── Cell ─────────────────────────────────────────────────────────────────────

interface CellProps {
  row: TimeRow;
  dayKey: DayKey;
  isToday: boolean;
  onSave: Props["onSave"];
}

function DayCell({ row, dayKey, isToday, onSave }: CellProps) {
  const entry = row.days[dayKey];
  const [value, setValue] = useState(
    entry?.hours ? formatHours(entry.hours) : "",
  );
  const [saving, setSaving] = useState(false);
  const prevRef = useRef(value);

  // Sync value when server data updates externally (week nav, background refresh)
  const freshVal = entry?.hours ? formatHours(entry.hours) : "";
  useEffect(() => {
    if (freshVal !== prevRef.current && !saving) {
      setValue(freshVal);
      prevRef.current = freshVal;
    }
  }, [freshVal, saving]);

  const disabled =
    entry?.approved || entry?.submitted || entry?.disabled || false;

  const handleBlur = async () => {
    if (value === prevRef.current) return;

    // Parse input: accept "1.5", "1:30", "1.5h"
    let hours = 0;
    if (value.trim()) {
      const colonMatch = value.match(/^(\d+):(\d{2})$/);
      if (colonMatch) {
        hours = parseInt(colonMatch[1]) + parseInt(colonMatch[2]) / 60;
      } else {
        hours = parseFloat(value.replace(/[^\d.]/g, ""));
      }
      if (isNaN(hours) || hours < 0) {
        setValue(prevRef.current);
        return;
      }
    }

    setSaving(true);
    try {
      await onSave(row, dayKey, hours, entry?.memo ?? "");
      const newVal = hours ? formatHours(hours) : "";
      setValue(newVal);
      prevRef.current = newVal;
    } catch {
      setValue(prevRef.current);
    } finally {
      setSaving(false);
    }
  };

  const cellClass = ["ft-day-cell", isToday ? "ft-today" : ""]
    .filter(Boolean)
    .join(" ");

  const inputClass = [
    "ft-day-input",
    entry?.approved ? "ft-approved" : "",
    entry?.submitted ? "ft-submitted" : "",
    !disabled && entry?.hours ? "ft-has-value" : "",
    saving ? "ft-saving" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <td className={cellClass}>
      <input
        type="text"
        className={inputClass}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => {
          prevRef.current = value;
        }}
        onBlur={handleBlur}
        readOnly={disabled}
        title={
          entry?.approved
            ? "Approved — cannot edit"
            : entry?.submitted
              ? "Submitted — pending approval"
              : undefined
        }
      />
    </td>
  );
}

// ── Footer totals ─────────────────────────────────────────────────────────────

function DayTotals({
  rows,
  dayDates,
  today,
}: {
  rows: TimeRow[];
  dayDates: string[];
  today: string;
}) {
  const grandTotal = DAYS.reduce(
    (s, dk) => s + rows.reduce((rs, r) => rs + (r.days[dk]?.hours ?? 0), 0),
    0,
  );

  return (
    <tr>
      <td colSpan={2} className="ft-total-label">
        Week total
      </td>
      {DAYS.map((dk, i) => {
        const total = rows.reduce((s, r) => s + (r.days[dk]?.hours ?? 0), 0);
        return (
          <td
            key={dk}
            className={`ft-col-day${dayDates[i] === today ? " ft-today" : ""}`}
          >
            {total ? formatHours(total) : ""}
          </td>
        );
      })}
      <td className="ft-col-total">
        {grandTotal ? formatHours(grandTotal) : ""}
      </td>
      <td className="ft-col-del" />
    </tr>
  );
}
