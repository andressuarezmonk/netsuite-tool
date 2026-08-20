import { useWeekStore } from "./useWeekStore";
import { useCatalogStore } from "./useCatalogStore";
import { useStatusStore } from "./useStatusStore";

export function useStore() {
  const weekStore = useWeekStore();
  const catalogStore = useCatalogStore();
  const statusStore = useStatusStore();

  return { ...weekStore, ...catalogStore, ...statusStore };
}

export type Store = ReturnType<typeof useStore>;

// Re-export focused store types for hooks that only need a slice
export type { WeekStore } from "./useWeekStore";
export type { CatalogStore } from "./useCatalogStore";
export type { StatusStore } from "./useStatusStore";
export type { Week } from "./useWeekStore";
export type { Catalog } from "./useCatalogStore";
