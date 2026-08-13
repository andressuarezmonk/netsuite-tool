import { createContext, useContext } from "react";
import type { TimeRow } from "@/utils/types";
import type { DayKey } from "@/utils/constants";
import type {
  StatusKind,
  StatusEntry,
} from "../components/atoms/StatusBar/StatusBar";
import type { Store, Session, Week, Catalog } from "./useStore";

export interface AppStore {
  session: Session;
  week: Week;
  catalog: Catalog;
  statuses: Record<string, StatusEntry>;
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

// Re-export Store type for hooks that need internal access
export type { Store };
