import { createContext, useContext } from "react";
import type { TimeRow } from "@/utils/types";
import type {
  StatusKind,
  StatusEntry,
} from "../components/atoms/StatusBar/StatusBar";
import type { Week, WeekStore } from "./useWeekStore";
import type { Catalog } from "./useCatalogStore";
import type { StatusStore } from "./useStatusStore";

export interface AppStore {
  weekStore: WeekStore;
  statusStore: StatusStore;
  week: Week;
  catalog: Catalog;
  statuses: Record<string, StatusEntry>;
  // Page-level actions
  navigate: (mondayISO: string) => void;
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
