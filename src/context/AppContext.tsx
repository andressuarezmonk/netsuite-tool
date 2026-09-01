import { createContext, useContext } from "react";
import type { WeekStore } from "./useWeekStore";
import type { CatalogStore } from "./useCatalogStore";
import type { StatusStore } from "./useStatusStore";
import type { WeekCacheHandle } from "../hooks/useWeekCache";
import type { RowMutations } from "../hooks/useRowMutations";
import type { WeekCopy } from "../hooks/useWeekCopy";

export interface AppStore {
  weekStore: WeekStore;
  catalogStore: CatalogStore;
  statusStore: StatusStore;
  weekCacheHandle: WeekCacheHandle;
  onSave: RowMutations["onSave"];
  onDelete: RowMutations["onDelete"];
  onCopyPreviousWeek: WeekCopy["onCopyPreviousWeek"];
}

export const AppContext = createContext<AppStore | null>(null);

export function useStore(): AppStore {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useStore must be used inside AppContext.Provider");
  return ctx;
}
