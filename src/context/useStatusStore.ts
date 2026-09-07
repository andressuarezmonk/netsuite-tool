import { useCallback, useRef, useState } from "react";
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

  // Each status id gets its own transient-clear timer so unrelated banners
  // (e.g. the save error toast and the save progress counter) don't cancel
  // each other's auto-dismiss.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const setStatus = useCallback((id: string, msg: string, kind: StatusKind) => {
    setStatuses((prev) => ({ ...prev, [id]: { id, msg, kind } }));
  }, []);

  const clearStatus = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setStatuses((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const setTransientStatus = useCallback(
    (id: string, msg: string, kind: StatusKind, ms = 2500) => {
      setStatuses((prev) => ({ ...prev, [id]: { id, msg, kind } }));
      const existing = timersRef.current.get(id);
      if (existing) clearTimeout(existing);
      timersRef.current.set(
        id,
        setTimeout(() => {
          timersRef.current.delete(id);
          setStatuses((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }, ms),
      );
    },
    [],
  );

  return { statuses, setStatus, clearStatus, setTransientStatus };
}

export type StatusStore = ReturnType<typeof useStatusStore>;
