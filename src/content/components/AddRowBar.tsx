import React, { useState, useEffect, useRef } from 'react';
import { getProjects, getTasks } from '@/lib/api';
import { TimeRow } from '@/lib/types';
import { Project } from '@/lib/types';

interface Props {
  weekISO: string;
  onAdd: (row: TimeRow) => void;
}

export default function AddRowBar({ onAdd }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [projId, setProjId] = useState('');
  const [taskId, setTaskId] = useState('');
  const mountedRef = useRef(true);

  // Poll for projects — getProjects() is populated async by loadInit
  useEffect(() => {
    mountedRef.current = true;
    const tryLoad = () => {
      const p = getProjects();
      if (p.length > 0) {
        if (mountedRef.current) { setProjects(p); setLoading(false); }
      } else {
        setTimeout(tryLoad, 200);
      }
    };
    tryLoad();
    return () => { mountedRef.current = false; };
  }, []);

  const tasks = projId ? getTasks(projId) : [];
  const proj = projects.find(p => p.id === projId);
  const task = tasks.find(t => t.id === taskId);
  const canAdd = projId !== '' && taskId !== '';

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd({
      projId, taskId,
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
      {loading ? (
        <>
          <span className="ft-spinner ft-spinner--sm" style={{ color: '#1a73e8' }} />
          <span className="ft-add-loading">Loading projects and tasks…</span>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
