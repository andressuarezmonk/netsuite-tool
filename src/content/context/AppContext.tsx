import { createContext, useContext } from "react";
import type { TimeRow, WeekData, Project, Task } from "@/content/utils/types";
import type {
  StatusKind,
  StatusEntry,
} from "../components/atoms/StatusBar/StatusBar";
import type { DayKey } from "@/content/utils/constants";

export interface AppStore {
  // NS data
  userId: string;
  defaultItemId: string;
  projects: Project[];
  tasks: Record<string, Task[]>;
  // Week state
  weekISO: string;
  weekData: WeekData | null;
  refreshing: boolean;
  statuses: Record<string, StatusEntry>;
  initialized: boolean;
  // Actions
  navigate: (mondayISO: string) => void;
  onSave: (
    row: TimeRow,
    dayKey: DayKey,
    hours: number,
    memo: string,
  ) => Promise<void>;
  onDelete: (row: TimeRow) => Promise<void>;
  onAddRow: (row: TimeRow) => void;
  setStatus: (id: string, msg: string, kind: StatusKind) => void;
  clearStatus: (id: string) => void;
}

export const AppContext = createContext<AppStore | null>(null);

export function useStore(): AppStore {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useStore must be used inside AppContext.Provider");
  return ctx;
}
