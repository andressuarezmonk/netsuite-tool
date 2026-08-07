import { createContext, useContext, type Dispatch } from "react";
import type { TimeRow, WeekData } from "@/content/utils/types";
import type {
  StatusEntry,
  StatusKind,
} from "../components/atoms/StatusBar/StatusBar";
import type { Action } from "../utils/appReducer";
import type { DayKey } from "@/content/utils/constants";

export interface AppState {
  weekISO: string;
  weekData: WeekData | null;
  refreshing: boolean;
  statuses: Record<string, StatusEntry>;
  initialized: boolean;
}

export const AppStateContext = createContext<AppState | null>(null);

export interface AppActions {
  dispatch: Dispatch<Action>;
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

export const AppActionsContext = createContext<AppActions | null>(null);

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx)
    throw new Error("useAppState must be used inside AppStateContext.Provider");
  return ctx;
}

export function useAppActions(): AppActions {
  const ctx = useContext(AppActionsContext);
  if (!ctx)
    throw new Error(
      "useAppActions must be used inside AppActionsContext.Provider",
    );
  return ctx;
}
