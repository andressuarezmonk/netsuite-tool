import React, { useState } from 'react';
import { getProjects, getTasks } from '@/lib/api';
import { TimeRow } from '@/lib/types';

interface Props {
  weekISO: string;
  onAdd: (row: TimeRow) => void;
}

export default function AddRowBar({ onAdd }: Props) {
  const projects = getProjects();
  const [projId, setProjId] = useState('');
  const [taskId, setTaskId] = useState('');

  const tasks = projId ? getTasks(projId) : [];
  const proj = projects.find(p => p.id === projId);
  const task = tasks.find(t => t.id === taskId);

  const canAdd = projId !== '' && taskId !== '';

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd({
      projId,
      taskId,
      itemId:   '754',
      projName: proj?.name ?? projId,
      taskName: task?.name ?? taskId,
      projRaw:  proj?.raw ?? projId,
      taskRaw:  task?.raw ?? taskId,
      days: {},
    });
    setProjId('');
    setTaskId('');
  };

  return (
    <div className="ft-add-bar">
      <select
        className="ft-add-proj"
        value={projId}
        onChange={e => { setProjId(e.target.value); setTaskId(''); }}
      >
        <option value="">— Select project —</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <select
        className="ft-add-task"
        value={taskId}
        onChange={e => setTaskId(e.target.value)}
        disabled={!projId}
      >
        <option value="">— Select task —</option>
        {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      <button
        className="ft-btn-add"
        onClick={handleAdd}
        disabled={!canAdd}
        title={!projId ? 'Select a project first' : !taskId ? 'Select a task' : undefined}
      >
        + Add row
      </button>
    </div>
  );
}
