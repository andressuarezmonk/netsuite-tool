import { DayKey } from './constants';

export interface DayEntry {
  hours: number;
  memo: string;
  timeid: string;
  approved: boolean;
  submitted: boolean;
  disabled: boolean;
}

export interface TimeRow {
  projId: string;
  taskId: string;
  itemId: string;
  projName: string;
  taskName: string;
  projRaw: string;
  taskRaw: string;
  days: Partial<Record<DayKey, DayEntry>>;
}

export interface WeekData {
  rows: TimeRow[];
  weekStart: string; // ISO monday
}

export interface Project {
  id: string;
  raw: string;
  name: string;
}

export interface Task {
  id: string;
  raw: string;
  name: string;
}

export interface SaveRowParams {
  projId: string;
  projRaw: string;
  taskId: string;
  taskRaw: string;
  itemId: string;
  weekISO: string;
  dayKey: DayKey;
  hours: number;
  memo: string;
  timeid: string;
}
