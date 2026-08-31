import { useState } from "react";
import type { TimeRow, Project, Task } from "@/utils/types";
import { useStore } from "../../../context/AppContext";
import { SessionService } from "@/services/session.service";
import s from "./AddRowBar.module.scss";

export default function AddRowBar() {
  const {
    catalog,
    weekStore: { setWeek },
  } = useStore();
  const { projects, tasks: allTasks } = catalog;
  const [projId, setProjId] = useState("");
  const [taskId, setTaskId] = useState("");

  const tasks = projId ? (allTasks[projId] ?? []) : [];
  const proj = projects.find((p: Project) => p.id === projId);
  const task = tasks.find((t: Task) => t.id === taskId);
  const canAdd = projId !== "" && taskId !== "";

  const addRow = (row: TimeRow) => {
    setWeek((prev) =>
      prev.weekData
        ? {
            ...prev,
            weekData: { ...prev.weekData, rows: [...prev.weekData.rows, row] },
          }
        : prev,
    );
  };

  const handleAdd = () => {
    if (!canAdd) return;
    const row: TimeRow = {
      rowKey: `new_${Date.now()}`,
      projId,
      taskId,
      itemId: SessionService.get().defaultItemId,
      projName: proj?.name ?? projId,
      taskName: task?.name ?? taskId,
      projRaw: proj?.raw ?? projId,
      taskRaw: task?.raw ?? taskId,
      days: {},
    };
    addRow(row);
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
