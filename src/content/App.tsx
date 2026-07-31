import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import { DAYS } from '@/lib/constants';
import { addDays, getMondayISO, todayISO, weekRangeLabel } from '@/lib/dates';
import { loadInit, loadWeek, saveRow } from '@/lib/api';
import { getCached, setCached, evictOldWeeks } from '@/lib/cache';
import { mergeWeekData } from '@/lib/merge';
import { WeekData, TimeRow } from '@/lib/types';
import WeekGrid from './components/WeekGrid';
import WeekNav from './components/WeekNav';
import AddRowBar from './components/AddRowBar';
import StatusBar from './components/StatusBar';

interface State {
  weekISO: string;
  weekData: WeekData | null;
  /** True while a background fetch is in-flight (cached data is being shown) */
  refreshing: boolean;
  status: { msg: string; type: 'loading' | 'success' | 'error' | '' };
  initialized: boolean;
}

type Action =
  | { type: 'SET_WEEK'; weekISO: string }
  | { type: 'SET_DATA'; data: WeekData; refreshing?: boolean }
  | { type: 'SET_STATUS'; msg: string; kind: State['status']['type'] }
  | { type: 'CLEAR_STATUS' }
  | { type: 'SET_REFRESHING'; value: boolean }
  | { type: 'INITIALIZED' }
  | { type: 'ADD_ROW'; row: TimeRow };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_WEEK':
      return { ...state, weekISO: action.weekISO, weekData: null, refreshing: false };
    case 'SET_DATA':
      return { ...state, weekData: action.data, refreshing: action.refreshing ?? false };
    case 'SET_STATUS':
      return { ...state, status: { msg: action.msg, type: action.kind } };
    case 'CLEAR_STATUS':
      return { ...state, status: { msg: '', type: '' } };
    case 'SET_REFRESHING':
      return { ...state, refreshing: action.value };
    case 'INITIALIZED':
      return { ...state, initialized: true };
    case 'ADD_ROW':
      if (!state.weekData) return state;
      return {
        ...state,
        weekData: { ...state.weekData, rows: [...state.weekData.rows, action.row] },
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
    status: { msg: 'Initializing…', type: 'loading' },
    initialized: false,
  });

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the currently displayed WeekData so background merges can access it
  const currentWeekDataRef = useRef<WeekData | null>(null);
  // Tracks unsaved local edits: "projId_taskId_dayKey" -> hours typed by user
  const localEditsRef = useRef<Map<string, number>>(new Map());
  // Tracks which week the user is currently viewing — fetches for other weeks are discarded
  const activeWeekRef = useRef<string>(getMondayISO(todayISO()));

  // Keep ref in sync with state
  useEffect(() => {
    currentWeekDataRef.current = state.weekData;
  }, [state.weekData]);

  const setStatus = useCallback((msg: string, kind: State['status']['type']) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    dispatch({ type: 'SET_STATUS', msg, kind });
    if (kind === 'success') {
      statusTimerRef.current = setTimeout(() => dispatch({ type: 'CLEAR_STATUS' }), 2500);
    }
  }, []);

  /**
   * Cache-first week load:
   * 1. Instantly render from cache if available
   * 2. Fetch fresh data in background
   * 3. Merge: fresh wins except for cells with pending local edits;
   *    approved cells always take the fresh (server-authoritative) value
   */
  const loadWeekWithCache = useCallback(async (mondayISO: string) => {
    // Mark this as the active week immediately
    activeWeekRef.current = mondayISO;
    localEditsRef.current = new Map();

    const cached = await getCached(mondayISO);

    // Bail if the user already navigated away while we were reading the cache
    if (activeWeekRef.current !== mondayISO) return;

    if (cached) {
      dispatch({ type: 'SET_DATA', data: cached, refreshing: true });
      dispatch({ type: 'CLEAR_STATUS' });
    } else {
      setStatus('Loading…', 'loading');
    }

    try {
      const fresh = await loadWeek(mondayISO);

      // Bail if user navigated away while the fetch was in flight
      if (activeWeekRef.current !== mondayISO) {
        // Still update the cache silently so the data is ready next time
        await setCached(mondayISO, fresh);
        return;
      }

      await setCached(mondayISO, fresh);

      const displayed = currentWeekDataRef.current;
      const merged = displayed
        ? mergeWeekData(displayed, fresh, localEditsRef.current)
        : fresh;

      dispatch({ type: 'SET_DATA', data: merged, refreshing: false });
      dispatch({ type: 'CLEAR_STATUS' });
    } catch (err) {
      if (activeWeekRef.current !== mondayISO) return; // navigated away, discard error
      if (!cached) {
        setStatus(`Error loading week: ${(err as Error).message}`, 'error');
      } else {
        setStatus(`⚠ Background refresh failed`, 'error');
        dispatch({ type: 'SET_REFRESHING', value: false });
      }
    }
  }, [setStatus]);

  // Initialize on mount
  useEffect(() => {
    (async () => {
      try {
        evictOldWeeks(); // background cleanup, fire-and-forget
        await loadInit();
        dispatch({ type: 'INITIALIZED' });
        await loadWeekWithCache(state.weekISO);
      } catch (err) {
        setStatus(`Init failed: ${(err as Error).message}`, 'error');
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
    row: TimeRow,
    dayKey: typeof DAYS[number],
    hours: number,
    memo: string,
  ) => {
    const editKey = `${row.projId}_${row.taskId}_${dayKey}`;

    // Track local edit so a concurrent background refresh won't overwrite it
    if (hours > 0) {
      localEditsRef.current.set(editKey, hours);
    } else {
      localEditsRef.current.delete(editKey);
    }

    try {
      await saveRow({
        projId:  row.projId,
        projRaw: row.projRaw,
        taskId:  row.taskId,
        taskRaw: row.taskRaw,
        itemId:  row.itemId,
        weekISO: state.weekISO,
        dayKey,
        hours,
        memo,
        timeid: row.days[dayKey]?.timeid ?? '',
      });

      setStatus('✓ Saved', 'success');

      // Save committed — clear the local edit and refresh from server
      localEditsRef.current.delete(editKey);
      const fresh = await loadWeek(state.weekISO);
      await setCached(state.weekISO, fresh);

      const merged = mergeWeekData(
        currentWeekDataRef.current ?? fresh,
        fresh,
        localEditsRef.current,
      );
      dispatch({ type: 'SET_DATA', data: merged });
    } catch (err) {
      localEditsRef.current.delete(editKey);
      setStatus(`Save failed: ${(err as Error).message}`, 'error');
      throw err; // let WeekGrid revert the cell
    }
  }, [state.weekISO, setStatus]);

  const handleAddRow = useCallback((row: TimeRow) => {
    dispatch({ type: 'ADD_ROW', row });
  }, []);

  return (
    <div className="ft-root">
      <header className="ft-header">
        <div>
          <h1>⏱ Weekly Time Entry</h1>
          <p className="ft-subtitle">Media.Monks — fast entry</p>
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

      <StatusBar msg={state.status.msg} type={state.status.type} />

      <WeekGrid
        weekData={state.weekData}
        weekISO={state.weekISO}
        onSave={handleSave}
      />

      {state.initialized && (
        <AddRowBar weekISO={state.weekISO} onAdd={handleAddRow} />
      )}

      <footer className="ft-footer">
        Fast Time Tracker ·{' '}
        <a href="https://3851137.app.netsuite.com">NetSuite Home</a>
      </footer>
    </div>
  );
}
