import type { WeekData, TimeRow } from "@/lib/types";
import {
  StatusKind,
  type StatusEntry,
} from "../components/atoms/StatusBar/StatusBar";
import { StatusId } from "../constants/statusId";
import { getMondayISO, todayISO } from "@/lib/dates";
import { APP_ACTION_TYPE } from "../constants/appActionType";

export { APP_ACTION_TYPE };

export interface State {
  weekISO: string;
  weekData: WeekData | null;
  refreshing: boolean;
  statuses: Record<string, StatusEntry>;
  initialized: boolean;
}

export type Action =
  | { type: APP_ACTION_TYPE.SetWeek; weekISO: string }
  | { type: APP_ACTION_TYPE.SetData; data: WeekData; refreshing?: boolean }
  | { type: APP_ACTION_TYPE.SetStatus; entry: StatusEntry }
  | { type: APP_ACTION_TYPE.ClearStatus; id: string }
  | { type: APP_ACTION_TYPE.SetRefreshing; value: boolean }
  | { type: APP_ACTION_TYPE.Initialized }
  | { type: APP_ACTION_TYPE.AddRow; row: TimeRow }
  | { type: APP_ACTION_TYPE.RemoveRow; rowKey: string };

export const initialState: State = {
  weekISO: getMondayISO(todayISO()),
  weekData: null,
  refreshing: false,
  statuses: {
    [StatusId.Init]: {
      id: StatusId.Init,
      msg: "Initializing…",
      kind: StatusKind.Fetch,
    },
  },
  initialized: false,
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case APP_ACTION_TYPE.SetWeek:
      return {
        ...state,
        weekISO: action.weekISO,
        weekData: null,
        refreshing: false,
      };
    case APP_ACTION_TYPE.SetData:
      return {
        ...state,
        weekData: action.data,
        refreshing: action.refreshing ?? false,
      };
    case APP_ACTION_TYPE.SetStatus:
      return {
        ...state,
        statuses: { ...state.statuses, [action.entry.id]: action.entry },
      };
    case APP_ACTION_TYPE.ClearStatus: {
      const next = { ...state.statuses };
      delete next[action.id];
      return { ...state, statuses: next };
    }
    case APP_ACTION_TYPE.SetRefreshing:
      return { ...state, refreshing: action.value };
    case APP_ACTION_TYPE.Initialized:
      return { ...state, initialized: true };
    case APP_ACTION_TYPE.AddRow:
      if (!state.weekData) return state;
      return {
        ...state,
        weekData: {
          ...state.weekData,
          rows: [...state.weekData.rows, action.row],
        },
      };
    case APP_ACTION_TYPE.RemoveRow:
      if (!state.weekData) return state;
      return {
        ...state,
        weekData: {
          ...state.weekData,
          rows: state.weekData.rows.filter((r) => r.rowKey !== action.rowKey),
        },
      };
    default:
      return state;
  }
}
