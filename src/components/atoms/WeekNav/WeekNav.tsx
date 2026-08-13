import React from "react";
import { addDays, getMondayISO, todayISO, weekRangeLabel } from "@/utils/dates";
import { useStore } from "../../../context/AppContext";
import s from "./WeekNav.module.scss";

function isoToWeekValue(mondayISO: string): string {
  const d = new Date(mondayISO + "T12:00:00");
  const year = d.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const dayOfYear =
    Math.floor((d.getTime() - startOfYear.getTime()) / 86400000) + 1;
  const weekNum = Math.ceil((dayOfYear + startOfYear.getDay()) / 7);
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

function weekValueToISO(weekVal: string): string {
  const [yearStr, weekStr] = weekVal.split("-W");
  const year = parseInt(yearStr);
  const week = parseInt(weekStr);
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const weekOneMonday = new Date(jan4.getTime() - (jan4Day - 1) * 86400000);
  const target = new Date(weekOneMonday.getTime() + (week - 1) * 7 * 86400000);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return getMondayISO(`${y}-${m}-${day}`);
}

export default function WeekNav() {
  const { week, navigate } = useStore();
  const { weekISO } = week;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const mondayISO = val.includes("-W")
      ? weekValueToISO(val)
      : getMondayISO(val);
    navigate(mondayISO);
  };

  return (
    <div className={s.nav}>
      <button onClick={() => navigate(addDays(weekISO, -7))}>◀ Prev</button>

      <label className={s.labelWrap}>
        <input
          type="week"
          className={s.weekInput}
          value={isoToWeekValue(weekISO)}
          onChange={handleChange}
          title="Jump to a specific week"
        />
        <span className={s.labelText} aria-hidden="true">
          {weekRangeLabel(weekISO)}
          <span className={s.calIcon}>📅</span>
        </span>
      </label>

      <button onClick={() => navigate(addDays(weekISO, 7))}>Next ▶</button>
      <button
        className={s.todayBtn}
        onClick={() => navigate(getMondayISO(todayISO()))}
      >
        This week
      </button>
    </div>
  );
}
