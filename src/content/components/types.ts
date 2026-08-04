import type { DayKey } from "@/lib/constants";
import type { TimeRow } from "@/lib/types";

export type OnSave = (
  row: TimeRow,
  dayKey: DayKey,
  hours: number,
  memo: string,
) => Promise<void>;

export type OnDelete = (row: TimeRow) => Promise<void>;

export interface RowProps {
  row: TimeRow;
  dayDates: string[];
  today: string;
  onSave: OnSave;
  onDelete: OnDelete;
}

export interface CellProps {
  row: TimeRow;
  dayKey: DayKey;
  isToday: boolean;
  onSave: OnSave;
}

export interface TotalsProps {
  rows: TimeRow[];
  dayDates: string[];
  today: string;
}
