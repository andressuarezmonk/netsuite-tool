import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import { DAYS, getNSBaseUrl } from '@/lib/constants';
import { addDays, getMondayISO, todayISO, weekRangeLabel } from '@/lib/dates';
import { loadInit, loadWeek, saveRow, deleteRow } from '@/lib/api';
import { getCached, setCached, evictOldWeeks } from '@/lib/cache';
import { mergeWeekData } from '@/lib/merge';
import type { WeekData, TimeRow } from '@/lib/types';
import WeekGrid from './components/WeekGrid';
import WeekNav from './components/WeekNav';
import AddRowBar from './components/AddRowBar';
import StatusBar, { type StatusEntry, type StatusKind } from './components/StatusBar';
interface State {
  weekISO: string;
  weekData: WeekData | null;
  refreshing: boolean;
  statuses: Record<string, StatusEntry>; // keyed by id for independent control
  initialized: boolean;
}

type Action =
  | { type: 'SET_WEEK'; weekISO: string }
  | { type: 'SET_DATA'; data: WeekData; refreshing?: boolean }
  | { type: 'SET_STATUS'; entry: StatusEntry }
  | { type: 'CLEAR_STATUS'; id: string }
  | { type: 'SET_REFRESHING'; value: boolean }
  | { type: 'INITIALIZED' }
  | { type: 'ADD_ROW'; row: TimeRow }
  | { type: 'REMOVE_ROW'; projId: string; taskId: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_WEEK':
      return { ...state, weekISO: action.weekISO, weekData: null, refreshing: false };
    case 'SET_DATA':
      return { ...state, weekData: action.data, refreshing: action.refreshing ?? false };
    case 'SET_STATUS': {
      return { ...state, statuses: { ...state.statuses, [action.entry.id]: action.entry } };
    }
    case 'CLEAR_STATUS': {
      const next = { ...state.statuses };
      delete next[action.id];
      return { ...state, statuses: next };
    }
    case 'SET_REFRESHING':
      return { ...state, refreshing: action.value };
    case 'INITIALIZED':
      return { ...state, initialized: true };
    case 'ADD_ROW':
      if (!state.weekData) return state;
      return { ...state, weekData: { ...state.weekData, rows: [...state.weekData.rows, action.row] } };
    case 'REMOVE_ROW':
      if (!state.weekData) return state;
      return {
        ...state,
        weekData: {
          ...state.weekData,
          rows: state.weekData.rows.filter(
            r => !(r.projId === action.projId && r.taskId === action.taskId),
          ),
        },
      };
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, {
    weekISO: getMondayISO(todayISO()),
    weekData: null,
    refreshing: false,
    statuses: { init: { id: 'init', msg: 'Initializing…', kind: 'fetch' } },
    initialized: false,
  });

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentWeekDataRef = useRef<WeekData | null>(null);
  const localEditsRef = useRef<Map<string, number>>(new Map());
  const activeWeekRef = useRef<string>(getMondayISO(todayISO()));

  useEffect(() => { currentWeekDataRef.current = state.weekData; }, [state.weekData]);

  const setStatus = useCallback((id: string, msg: string, kind: StatusKind) => {
    dispatch({ type: 'SET_STATUS', entry: { id, msg, kind } });
  }, []);

  const clearStatus = useCallback((id: string) => {
    dispatch({ type: 'CLEAR_STATUS', id });
  }, []);

  const setTransientStatus = useCallback((id: string, msg: string, kind: StatusKind, ms = 2500) => {
    dispatch({ type: 'SET_STATUS', entry: { id, msg, kind } });
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => dispatch({ type: 'CLEAR_STATUS', id }), ms);
  }, []);

  /**
   * Cache-first week load:
   * 1. Instantly render from cache if available
   * 2. Fetch fresh data in background
   * 3. Merge: fresh wins except for cells with pending local edits;
   *    approved cells always take the fresh (server-authoritative) value
   */
  const loadWeekWithCache = useCallback(async (mondayISO: string) => {
    activeWeekRef.current = mondayISO;
    localEditsRef.current = new Map();

    const cached = await getCached(mondayISO);
    if (activeWeekRef.current !== mondayISO) return;

    if (cached) {
      dispatch({ type: 'SET_DATA', data: cached, refreshing: true });
      setStatus('cache', 'Loaded from cache — refreshing…', 'cache');
    } else {
      setStatus('fetch', 'Loading week data…', 'fetch');
    }

    try {
      const fresh = await loadWeek(mondayISO);
      if (activeWeekRef.current !== mondayISO) {
        await setCached(mondayISO, fresh);
        return;
      }
      await setCached(mondayISO, fresh);
      const displayed = currentWeekDataRef.current;
      const merged = displayed
        ? mergeWeekData(displayed, fresh, localEditsRef.current)
        : fresh;
      dispatch({ type: 'SET_DATA', data: merged, refreshing: false });
      clearStatus('cache');
      clearStatus('fetch');
    } catch (err) {
      if (activeWeekRef.current !== mondayISO) return;
      if (!cached) {
        setStatus('fetch', `Failed to load: ${(err as Error).message}`, 'error');
      } else {
        setStatus('cache', `⚠ Refresh failed`, 'error');
        dispatch({ type: 'SET_REFRESHING', value: false });
      }
    }
  }, [setStatus, clearStatus]);

  useEffect(() => {
    (async () => {
      try {
        evictOldWeeks();
        await loadInit();
        dispatch({ type: 'INITIALIZED' });
        clearStatus('init');
        await loadWeekWithCache(state.weekISO);
      } catch (err) {
        setStatus('init', `Init failed: ${(err as Error).message}`, 'error');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = useCallback((mondayISO: string) => {
    activeWeekRef.current = mondayISO; // mark immediately so in-flight fetches are discarded
    dispatch({ type: 'SET_WEEK', weekISO: mondayISO });
    loadWeekWithCache(mondayISO);
  }, [loadWeekWithCache]);

  const handleSave = useCallback(async (
    row: TimeRow, dayKey: typeof DAYS[number], hours: number, memo: string,
  ) => {
    const editKey = `${row.projId}_${row.taskId}_${dayKey}`;
    if (hours > 0) localEditsRef.current.set(editKey, hours);
    else localEditsRef.current.delete(editKey);

    setStatus('mutation', 'Saving…', 'mutation');
    try {
      await saveRow({
        projId: row.projId, projRaw: row.projRaw,
        taskId: row.taskId, taskRaw: row.taskRaw,
        itemId: row.itemId, weekISO: state.weekISO,
        dayKey, hours, memo, timeid: row.days[dayKey]?.timeid ?? '',
      });
      localEditsRef.current.delete(editKey);
      setTransientStatus('mutation', '✓ Saved', 'success');
      const fresh = await loadWeek(state.weekISO);
      await setCached(state.weekISO, fresh);
      const merged = mergeWeekData(currentWeekDataRef.current ?? fresh, fresh, localEditsRef.current);
      dispatch({ type: 'SET_DATA', data: merged });
    } catch (err) {
      localEditsRef.current.delete(editKey);
      setTransientStatus('mutation', `Save failed: ${(err as Error).message}`, 'error');
      throw err;
    }
  }, [state.weekISO, setStatus, setTransientStatus]);

  const handleDelete = useCallback(async (row: TimeRow) => {
    const timeids = DAYS.map(dk => row.days[dk]?.timeid ?? '');
    setStatus('mutation', 'Deleting…', 'mutation');
    try {
      dispatch({ type: 'REMOVE_ROW', projId: row.projId, taskId: row.taskId });
      await deleteRow(timeids);
      setTransientStatus('mutation', '✓ Row deleted', 'success');
      const fresh = await loadWeek(state.weekISO);
      await setCached(state.weekISO, fresh);
    } catch (err) {
      setTransientStatus('mutation', `Delete failed: ${(err as Error).message}`, 'error');
      const fresh = await loadWeek(state.weekISO);
      await setCached(state.weekISO, fresh);
      const merged = mergeWeekData(currentWeekDataRef.current ?? fresh, fresh, localEditsRef.current);
      dispatch({ type: 'SET_DATA', data: merged });
    }
  }, [state.weekISO, setStatus, setTransientStatus]);

  const handleAddRow = useCallback((row: TimeRow) => {
    dispatch({ type: 'ADD_ROW', row });
  }, []);

  return (
    <div className="ft-root">
      <header className="ft-header">
        <div>
          <h1>⏱ Weekly Time Entry</h1>
          <p className="ft-subtitle">NetSuite — fast entry</p>
        </div>
        <button className="ft-link-btn" onClick={() => {
          sessionStorage.setItem('ft_bypass', '1');
          window.location.reload();
        }}>
          Load original page →
        </button>
      </header>

      <WeekNav
        weekISO={state.weekISO}
        label={weekRangeLabel(state.weekISO)}
        onPrev={() => navigate(addDays(state.weekISO, -7))}
        onNext={() => navigate(addDays(state.weekISO, 7))}
        onToday={() => navigate(getMondayISO(todayISO()))}
        refreshing={state.refreshing}
      />

      <StatusBar statuses={Object.values(state.statuses)} />

      <WeekGrid
        weekData={state.weekData}
        weekISO={state.weekISO}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      {state.initialized && (
        <AddRowBar weekISO={state.weekISO} onAdd={handleAddRow} />
      )}

      <footer className="ft-footer">
        Fast Time Tracker ·{' '}
        <a href={getNSBaseUrl()}>NetSuite Home</a>
      </footer>
    </div>
  );
}
