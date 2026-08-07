import { useEffect, useRef, useState } from "react";
import { getProjects, getTasks } from "@/content/utils/api";
import type { TimeRow, Project } from "@/content/utils/types";
import { useAppActions } from "../../../context/AppContext";
import s from "./AddRowBar.module.scss";

export default function AddRowBar() {
  const { onAddRow } = useAppActions();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [projId, setProjId] = useState("");
  const [taskId, setTaskId] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const tryLoad = () => {
      const p = getProjects();
      if (p.length > 0) {
        if (mountedRef.current) {
          setProjects(p);
          setLoading(false);
        }
      } else {
        setTimeout(tryLoad, 200);
      }
    };
    tryLoad();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const tasks = projId ? getTasks(projId) : [];
  const proj = projects.find((p) => p.id === projId);
  const task = tasks.find((t) => t.id === taskId);
  const canAdd = projId !== "" && taskId !== "";

  const handleAdd = () => {
    if (!canAdd) return;
    const row: TimeRow = {
      rowKey: `new_${Date.now()}`, // eslint-disable-line
      projId,
      taskId,
      itemId: "754",
      projName: proj?.name ?? projId,
      taskName: task?.name ?? taskId,
      projRaw: proj?.raw ?? projId,
      taskRaw: task?.raw ?? taskId,
      days: {},
    };
    onAddRow(row);
    setProjId("");
    setTaskId("");
  };

  return (
    <div className={s.bar}>
      {loading ? (
        <>
          <span className={s.spinner} style={{ color: "#1a73e8" }} />
          <span className={s.loading}>Loading projects and tasks…</span>
        </>
      ) : (
        <>
          <select
            className={s.projSelect}
            value={projId}
            onChange={(e) => {
              setProjId(e.target.value);
              setTaskId("");
            }}
          >
            <option value="">— Select project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            className={s.taskSelect}
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            disabled={!projId}
          >
            <option value="">— Select task —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <button
            className={s.addBtn}
            onClick={handleAdd}
            disabled={!canAdd}
            title={
              !projId
                ? "Select a project first"
                : !taskId
                  ? "Select a task"
                  : undefined
            }
          >
            + Add row
          </button>
        </>
      )}
    </div>
  );
}
