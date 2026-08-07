import type { Dispatch } from "react";
import type { Action } from "./appReducer";
import { APP_ACTION_TYPE } from "../constants/appActionType";
import type { StatusKind } from "../constants/statusKind";

/**
 * Factory that returns status helpers bound to a given dispatch.
 *
 * - setStatus:          shows a persistent status (stays until clearStatus is called)
 * - clearStatus:        removes a status by id
 * - setTransientStatus: shows a status that auto-dismisses after `ms` ms (default 2500)
 */
export function createStatusActions(dispatch: Dispatch<Action>) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (id: string, msg: string, kind: StatusKind) => {
    dispatch({ type: APP_ACTION_TYPE.SetStatus, entry: { id, msg, kind } });
  };

  const clearStatus = (id: string) => {
    dispatch({ type: APP_ACTION_TYPE.ClearStatus, id });
  };

  const setTransientStatus = (
    id: string,
    msg: string,
    kind: StatusKind,
    ms = 2500,
  ) => {
    dispatch({ type: APP_ACTION_TYPE.SetStatus, entry: { id, msg, kind } });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      dispatch({ type: APP_ACTION_TYPE.ClearStatus, id });
    }, ms);
  };

  return { setStatus, clearStatus, setTransientStatus };
}
