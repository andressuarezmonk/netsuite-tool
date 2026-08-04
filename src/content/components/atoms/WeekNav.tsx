interface Props {
  weekISO: string;
  label: string;
  refreshing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export default function WeekNav({ label, onPrev, onNext, onToday }: Props) {
  return (
    <div className="ft-week-nav">
      <button onClick={onPrev}>◀ Prev</button>
      <span className="ft-week-label">{label}</span>
      <button onClick={onNext}>Next ▶</button>
      <button className="ft-btn-today" onClick={onToday}>
        This week
      </button>
    </div>
  );
}
