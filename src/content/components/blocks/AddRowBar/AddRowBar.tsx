import { useState } from "react";
import { useNSData } from "@/content/context/NSDataContext";
import type { TimeRow, Project, Task } from "@/content/utils/types";
import { useAppActions } from "../../../context/AppContext";
import s from "./AddRowBar.module.scss";

export default function AddRowBar() {
  const { onAddRow } = useAppActions();
  const { projects, tasks: allTasks } = useNSData();
  const [projId, setProjId] = useState("");
  const [taskId, setTaskId] = useState("");

  const tasks = projId ? (allTasks[projId] ?? []) : [];
  const proj = projects.find((p: Project) => p.id === projId);
  const task = tasks.find((t: Task) => t.id === taskId);
  const canAdd = projId !== "" && taskId !== "";

  const handleAdd = () => {
    if (!canAdd) return;
    const row: TimeRow = {
      rowKey: `new_${Date.now()}`,
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
      {projects.length === 0 ? (
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
            {projects.map((p: Project) => (
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
            {tasks.map((t: Task) => (
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
