import React from 'react';

interface Props {
  msg: string;
  type: 'loading' | 'success' | 'error' | '';
}

export default function StatusBar({ msg, type }: Props) {
  if (!msg) return null;
  return (
    <div className={`ft-status ft-status--${type}`}>
      {type === 'loading' && <span className="ft-spinner" aria-hidden="true" />}
      {msg}
    </div>
  );
}
