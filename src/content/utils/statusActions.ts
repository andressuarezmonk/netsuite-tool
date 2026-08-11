import type { StatusKind } from "../constants/statusKind";
import type { StatusEntry } from "../components/atoms/StatusBar/StatusBar";

type SetStatuses = (
  updater: (prev: Record<string, StatusEntry>) => Record<string, StatusEntry>,
) => void;

/**
 * Factory that returns status helpers bound to a given statuses setter.
 *
 * - setStatus:          shows a persistent status (stays until clearStatus is called)
 * - clearStatus:        removes a status by id
 * - setTransientStatus: shows a status that auto-dismisses after `ms` ms (default 2500)
 */
export function createStatusActions(setStatuses: SetStatuses) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (id: string, msg: string, kind: StatusKind) => {
    setStatuses((prev) => ({ ...prev, [id]: { id, msg, kind } }));
  };

  const clearStatus = (id: string) => {
    setStatuses((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const setTransientStatus = (
    id: string,
    msg: string,
    kind: StatusKind,
    ms = 2500,
  ) => {
    setStatuses((prev) => ({ ...prev, [id]: { id, msg, kind } }));
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      setStatuses((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, ms);
  };

  return { setStatus, clearStatus, setTransientStatus };
}
