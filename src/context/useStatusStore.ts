import { useRef, useState } from "react";
import { StatusKind, type StatusEntry } from "../constants/statusKind";
import { StatusId } from "../constants/statusId";

export function useStatusStore() {
  const [statuses, setStatuses] = useState<Record<string, StatusEntry>>({
    [StatusId.Init]: {
      id: StatusId.Init,
      msg: "Initializing…",
      kind: StatusKind.Fetch,
    },
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setStatuses((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, ms);
  };

  return { statuses, setStatus, clearStatus, setTransientStatus };
}

export type StatusStore = ReturnType<typeof useStatusStore>;
