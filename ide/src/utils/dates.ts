const pad = (value: number) => String(value).padStart(2, "0");

/** Local calendar date as "YYYY-MM-DD". */
export function dateToISO(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO(): string {
  return dateToISO(new Date());
}

export function addDays(isoDate: string, numberOfDays: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + numberOfDays);
  return dateToISO(date);
}

export function getMondayISO(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  const daysFromMonday = date.getDay() === 0 ? -6 : 1 - date.getDay();
  date.setDate(date.getDate() + daysFromMonday);
  return dateToISO(date);
}

/** "Nov 23 – 29, 2026", or "Nov 30 – Dec 6, 2026" across a month boundary. */
export function formatWeekRange(mondayISO: string): string {
  const monday = new Date(`${mondayISO}T12:00:00`);
  const sunday = new Date(`${addDays(mondayISO, 6)}T12:00:00`);
  const monthOf = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short" });
  const sundayPart =
    monday.getMonth() === sunday.getMonth()
      ? String(sunday.getDate())
      : `${monthOf(sunday)} ${sunday.getDate()}`;
  return `${monthOf(monday)} ${monday.getDate()} – ${sundayPart}, ${sunday.getFullYear()}`;
}
