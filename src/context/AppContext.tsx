import { createContext, useContext } from "react";
import type { StatusKind, StatusEntry } from "../constants/statusKind";
import type { Week, WeekStore } from "./useWeekStore";
import type { Catalog, CatalogStore } from "./useCatalogStore";
import type { StatusStore } from "./useStatusStore";
import type { WeekCacheHandle } from "../hooks/useWeekCache";

export interface AppStore {
  weekStore: WeekStore;
  catalogStore: CatalogStore;
  statusStore: StatusStore;
  weekCacheHandle: WeekCacheHandle;
  week: Week;
  catalog: Catalog;
  statuses: Record<string, StatusEntry>;
  setStatus: (id: string, msg: string, kind: StatusKind) => void;
  clearStatus: (id: string) => void;
}

export const AppContext = createContext<AppStore | null>(null);

export function useStore(): AppStore {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useStore must be used inside AppContext.Provider");
  return ctx;
}
