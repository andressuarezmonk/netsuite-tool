import React from 'react';

export type StatusKind = 'cache' | 'fetch' | 'mutation' | 'success' | 'error' | '';

export interface StatusEntry {
  id: string;
  msg: string;
  kind: StatusKind;
}

interface Props {
  statuses: StatusEntry[];
}

const LABELS: Record<StatusKind, string> = {
  cache:    'Cache',
  fetch:    'Fetching',
  mutation: 'Saving',
  success:  '',
  error:    '',
  '':       '',
};

export default function StatusBar({ statuses }: Props) {
  const visible = statuses.filter(s => s.msg);
  if (visible.length === 0) return null;

  return (
    <div className="ft-statusbar">
      {visible.map(s => (
        <div key={s.id} className={`ft-status ft-status--${s.kind}`}>
          {(s.kind === 'cache' || s.kind === 'fetch' || s.kind === 'mutation') && (
            <span className="ft-spinner ft-spinner--sm" aria-hidden="true" />
          )}
          {LABELS[s.kind] && <span className="ft-status-label">{LABELS[s.kind]}</span>}
          {s.msg}
        </div>
      ))}
    </div>
  );
}
