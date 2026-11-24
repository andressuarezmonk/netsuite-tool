import { useState } from "react";
import { formatHours } from "@/utils/dates";
import { countWeekdayHolidays, getWeekTotal } from "@/utils/target";
import { MAX_WEEKLY_TARGET } from "@/services/target.service";
import { useStore } from "../../../context/AppContext";
import s from "./WeekProgress.module.scss";

export interface WeekProgressProps {
  weeklyTarget: number;
  onTargetChange: (hours: number) => void;
}

export default function WeekProgress({
  weeklyTarget,
  onTargetChange,
}: WeekProgressProps) {
  const { weekData } = useStore().weekStore.week;
  const [isEditing, setIsEditing] = useState(false);
  const [draftTarget, setDraftTarget] = useState("");

  if (!weekData) return null;

  const holidays = weekData.holidays ?? {};
  const holidayCount = countWeekdayHolidays(holidays);
  const weekTotal = getWeekTotal(weekData.rows);
  const difference = weeklyTarget - weekTotal;
  const percentComplete = Math.min(
    100,
    Math.round((weekTotal / weeklyTarget) * 100),
  );

  const isOver = difference < -0.01;
  const isComplete = !isOver && difference < 0.01;
  const barClass = isOver ? s.barOver : isComplete ? s.barComplete : s.bar;

  let remainingLabel = `${formatHours(difference)}h remaining`;
  if (isOver) remainingLabel = `${formatHours(-difference)}h over`;
  else if (isComplete) remainingLabel = "Target reached ✓";

  const startEditing = () => {
    setDraftTarget(String(weeklyTarget));
    setIsEditing(true);
  };

  const commitTarget = () => {
    const parsedTarget = Number(draftTarget);
    if (draftTarget.trim() !== "") onTargetChange(parsedTarget);
    setIsEditing(false);
  };

  return (
    <div className={s.progress}>
      <div className={s.summary}>
        <span className={s.hours}>
          {formatHours(weekTotal)} / {formatHours(weeklyTarget)}h
        </span>
        <span
          className={`${s.remaining}${isOver ? ` ${s.remainingOver}` : ""}${isComplete ? ` ${s.remainingComplete}` : ""}`}
        >
          {remainingLabel}
        </span>
        {holidayCount > 0 && (
          <span
            className={s.holidayNote}
            title="Holidays still count toward the target — log them under Out of Office"
          >
            {holidayCount} holiday{holidayCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div
        className={s.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentComplete}
        aria-label="Weekly hours progress"
      >
        <div className={barClass} style={{ width: `${percentComplete}%` }} />
      </div>

      {isEditing ? (
        <input
          type="number"
          className={s.targetInput}
          value={draftTarget}
          min={1}
          max={MAX_WEEKLY_TARGET}
          step={0.5}
          autoFocus
          aria-label="Weekly target hours"
          onChange={(event) => setDraftTarget(event.target.value)}
          onBlur={commitTarget}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitTarget();
            if (event.key === "Escape") setIsEditing(false);
          }}
        />
      ) : (
        <button
          type="button"
          className={s.targetButton}
          onClick={startEditing}
          title="Change weekly target"
        >
          Target: {formatHours(weeklyTarget)}h ✎
        </button>
      )}
    </div>
  );
}
