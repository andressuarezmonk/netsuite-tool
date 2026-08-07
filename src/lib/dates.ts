import { DAYS, type DayKey } from "./constants";

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getMondayISO(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "M/D/YYYY" → "YYYY-MM-DD" (no shift — applied contextually) */
export function nsToISO(ns: string): string {
  const [m, d, y] = ns.split("/");
  return `${y}-${pad(Number(m))}-${pad(Number(d))}`;
}

/** "YYYY-MM-DD" → "M/D/YYYY" */
export function isoToNS(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

/** "H:MM" → decimal hours (e.g. "6:30" → 6.5) */
export function nsToHours(s: string | null | undefined): number {
  if (!s) return 0;
  const [h, m] = s.split(":").map(Number);
  return h + (m || 0) / 60;
}

/** decimal hours → "H:MM" */
export function hoursToNS(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}:${pad(mins)}`;
}

/** Format decimal hours for display: 8 → "8", 1.5 → "1.5" */
export function formatHours(h: number): string {
  if (h === 0) return "0";
  if (!h) return "";
  return h === Math.floor(h) ? String(h) : h.toFixed(2).replace(/\.?0+$/, "");
}

export function weekRangeLabel(mondayISO: string): string {
  const mon = new Date(mondayISO + "T12:00:00");
  const sun = new Date(mondayISO + "T12:00:00");
  sun.setDate(sun.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(mon)} – ${fmt(sun)}, ${mon.getFullYear()}`;
}

/** Build an API date string shifted by -shift days to compensate for server timezone */
export function toApiDate(isoDate: string, shift: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() - shift);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

/** Apply shift to an API date string to get the real local date */
export function fromApiDate(nsDate: string, shift: number): string {
  const [m, d, y] = nsDate.split("/");
  const date = new Date(`${y}-${pad(Number(m))}-${pad(Number(d))}T12:00:00`);
  date.setDate(date.getDate() + shift);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dayIndexFromMonday(isoDate: string, mondayISO: string): number {
  return Math.round(
    (new Date(isoDate + "T12:00:00").getTime() -
      new Date(mondayISO + "T12:00:00").getTime()) /
      86400000,
  );
}

export function dayKeyFromIndex(i: number): DayKey | null {
  return DAYS[i] ?? null;
}
