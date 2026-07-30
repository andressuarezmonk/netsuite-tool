import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import { DAYS } from '@/lib/constants';
import { addDays, getMondayISO, todayISO, weekRangeLabel } from '@/lib/dates';
import { loadInit, loadWeek, saveRow } from '@/lib/api';
import { WeekData, TimeRow } from '@/lib/types';
import WeekGrid from './components/WeekGrid';
import WeekNav from './components/WeekNav';
import AddRowBar from './components/AddRowBar';
import StatusBar from './components/StatusBar';

interface State {
  weekISO: string;
  weekData: WeekData | null;
  status: { msg: string; type: 'loading' | 'success' | 'error' | '' };
  initialized: boolean;
}

type Action =
  | { type: 'SET_WEEK'; weekISO: string }
  | { type: 'SET_DATA'; data: WeekData }
  | { type: 'SET_STATUS'; msg: string; kind: State['status']['type'] }
  | { type: 'CLEAR_STATUS' }
  | { type: 'INITIALIZED' }
  | { type: 'ADD_ROW'; row: TimeRow };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_WEEK':   return { ...state, weekISO: action.weekISO, weekData: null };
    case 'SET_DATA':   return { ...state, weekData: action.data };
    case 'SET_STATUS': return { ...state, status: { msg: action.msg, type: action.kind } };
    case 'CLEAR_STATUS': return { ...state, status: { msg: '', type: '' } };
    case 'INITIALIZED': return { ...state, initialized: true };
    case 'ADD_ROW':
      if (!state.weekData) return state;
      return {
        ...state,
        weekData: { ...state.weekData, rows: [...state.weekData.rows, action.row] },
      };
    default: return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, {
    weekISO: getMondayISO(todayISO()),
    weekData: null,
    status: { msg: 'Initializing…', type: 'loading' },
    initialized: false,
  });

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStatus = useCallback((msg: string, kind: State['status']['type']) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    dispatch({ type: 'SET_STATUS', msg, kind });
    if (kind === 'success') {
      statusTimerRef.current = setTimeout(() => dispatch({ type: 'CLEAR_STATUS' }), 2500);
    }
  }, []);

  const fetchWeek = useCallback(async (mondayISO: string) => {
    setStatus('Loading…', 'loading');
    try {
      const data = await loadWeek(mondayISO);
      dispatch({ type: 'SET_DATA', data });
      dispatch({ type: 'CLEAR_STATUS' });
    } catch (err) {
      setStatus(`Error loading week: ${(err as Error).message}`, 'error');
    }
  }, [setStatus]);

  // Initialize
  useEffect(() => {
    (async () => {
      try {
        await loadInit();
        dispatch({ type: 'INITIALIZED' });
        await fetchWeek(state.weekISO);
      } catch (err) {
        setStatus(`Init failed: ${(err as Error).message}`, 'error');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate to a different week
  const navigate = useCallback((mondayISO: string) => {
    dispatch({ type: 'SET_WEEK', weekISO: mondayISO });
    fetchWeek(mondayISO);
  }, [fetchWeek]);

  const handleSave = useCallback(async (
    row: TimeRow, dayKey: typeof DAYS[number], hours: number, memo: string,
  ) => {
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
        timeid:  row.days[dayKey]?.timeid ?? '',
      });
      setStatus('✓ Saved', 'success');
      // Reload week to get fresh server data
      const fresh = await loadWeek(state.weekISO);
      dispatch({ type: 'SET_DATA', data: fresh });
    } catch (err) {
      setStatus(`Save failed: ${(err as Error).message}`, 'error');
      throw err; // let the cell revert its value
    }
  }, [state.weekISO, setStatus]);

  const handleAddRow = useCallback((row: TimeRow) => {
    dispatch({ type: 'ADD_ROW', row });
  }, []);

  const handleOriginal = () => {
    sessionStorage.setItem('ft_bypass', '1');
    window.location.reload();
  };

  return (
    <div className="ft-root">
      <header className="ft-header">
        <div>
          <h1>⏱ Weekly Time Entry</h1>
          <p className="ft-subtitle">Media.Monks — fast entry</p>
        </div>
        <button className="ft-link-btn" onClick={handleOriginal}>
          Load original page →
        </button>
      </header>

      <WeekNav
        weekISO={state.weekISO}
        label={weekRangeLabel(state.weekISO)}
        onPrev={() => navigate(addDays(state.weekISO, -7))}
        onNext={() => navigate(addDays(state.weekISO, 7))}
        onToday={() => navigate(getMondayISO(todayISO()))}
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
        <a href={`https://3851137.app.netsuite.com`}>NetSuite Home</a>
      </footer>
    </div>
  );
}
