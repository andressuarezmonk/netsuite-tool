import React from 'react';
import s from './StatusBar.module.scss';

export type StatusKind = 'cache' | 'fetch' | 'mutation' | 'success' | 'error' | '';

export interface StatusEntry {
  id: string;
  msg: string;
  kind: StatusKind;
}

interface Props {
  statuses: StatusEntry[];
}

const KIND_LABEL: Partial<Record<StatusKind, string>> = {
  cache:    'Cache',
  fetch:    'Fetching',
  mutation: 'Saving',
};

// Map kind to the CSS module class name
const KIND_CLASS: Record<StatusKind, string> = {
  cache:    s.statusCache    ?? '',
  fetch:    s.statusFetch    ?? '',
  mutation: s.statusMutation ?? '',
  success:  s.statusSuccess  ?? '',
  error:    s.statusError    ?? '',
  '':       '',
};

export default function StatusBar({ statuses }: Props) {
  const visible = statuses.filter(st => st.msg);
  if (visible.length === 0) return null;

  return (
    <div className={s.bar}>
      {visible.map(st => (
        <div key={st.id} className={`${s.status} ${KIND_CLASS[st.kind]}`}>
          {(st.kind === 'cache' || st.kind === 'fetch' || st.kind === 'mutation') && (
            <span className={`${s.spinner} ${s.spinnerSm}`} aria-hidden="true" />
          )}
          {KIND_LABEL[st.kind] && (
            <span className={s.label}>{KIND_LABEL[st.kind]}</span>
          )}
          {st.msg}
        </div>
      ))}
    </div>
  );
}
