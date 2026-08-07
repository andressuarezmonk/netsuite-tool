import { DAYS, type DayKey } from "./constants";

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function todayISO(): string {
  const today = new Date();
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

export function addDays(isoDate: string, numberOfDays: number): string {
  const date = new Date(isoDate + "T12:00:00");
  date.setDate(date.getDate() + numberOfDays);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getMondayISO(isoDate: string): string {
  const date = new Date(isoDate + "T12:00:00");
  const daysFromMonday = date.getDay() === 0 ? -6 : 1 - date.getDay();
  date.setDate(date.getDate() + daysFromMonday);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "M/D/YYYY" → "YYYY-MM-DD" (no shift — applied contextually) */
export function nsToISO(nsDate: string): string {
  const [month, day, year] = nsDate.split("/");
  return `${year}-${pad(Number(month))}-${pad(Number(day))}`;
}

/** "YYYY-MM-DD" → "M/D/YYYY" */
export function isoToNS(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${parseInt(month)}/${parseInt(day)}/${year}`;
}

/** "H:MM" → decimal hours (e.g. "6:30" → 6.5) */
export function nsToHours(nsTime: string | null | undefined): number {
  if (!nsTime) return 0;
  const [hours, minutes] = nsTime.split(":").map(Number);
  return hours + (minutes || 0) / 60;
}

/** decimal hours → "H:MM" */
export function hoursToNS(decimalHours: number): string {
  const wholeHours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - wholeHours) * 60);
  return `${wholeHours}:${pad(minutes)}`;
}

/** Format decimal hours for display: 8 → "8", 1.5 → "1.5" */
export function formatHours(decimalHours: number): string {
  if (decimalHours === 0) return "0";
  if (!decimalHours) return "";
  return decimalHours === Math.floor(decimalHours)
    ? String(decimalHours)
    : decimalHours.toFixed(2).replace(/\.?0+$/, "");
}

export function weekRangeLabel(mondayISO: string): string {
  const monday = new Date(mondayISO + "T12:00:00");
  const sunday = new Date(mondayISO + "T12:00:00");
  sunday.setDate(sunday.getDate() + 6);
  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${formatDate(monday)} – ${formatDate(sunday)}, ${monday.getFullYear()}`;
}

/** Build an API date string shifted by -shift days to compensate for server timezone */
export function toApiDate(isoDate: string, timezoneShiftDays: number): string {
  const date = new Date(isoDate + "T12:00:00");
  date.setDate(date.getDate() - timezoneShiftDays);
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

/** Apply shift to an API date string to get the real local date */
export function fromApiDate(nsDate: string, timezoneShiftDays: number): string {
  const [month, day, year] = nsDate.split("/");
  const date = new Date(
    `${year}-${pad(Number(month))}-${pad(Number(day))}T12:00:00`,
  );
  date.setDate(date.getDate() + timezoneShiftDays);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dayIndexFromMonday(isoDate: string, mondayISO: string): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round(
    (new Date(isoDate + "T12:00:00").getTime() -
      new Date(mondayISO + "T12:00:00").getTime()) /
      MS_PER_DAY,
  );
}

export function dayKeyFromIndex(dayIndex: number): DayKey | null {
  return DAYS[dayIndex] ?? null;
}
