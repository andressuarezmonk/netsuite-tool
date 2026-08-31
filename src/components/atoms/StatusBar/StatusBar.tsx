import { useStore } from "../../../context/AppContext";
import { StatusKind } from "../../../constants/statusKind";
import s from "./StatusBar.module.scss";

const KIND_LABEL: Partial<Record<StatusKind, string>> = {
  [StatusKind.Cache]: "Cache",
  [StatusKind.Fetch]: "Fetching",
  [StatusKind.Mutation]: "Saving",
};

const KIND_CLASS: Record<StatusKind, string> = {
  [StatusKind.Cache]: s.statusCache ?? "",
  [StatusKind.Fetch]: s.statusFetch ?? "",
  [StatusKind.Mutation]: s.statusMutation ?? "",
  [StatusKind.Success]: s.statusSuccess ?? "",
  [StatusKind.Error]: s.statusError ?? "",
  [StatusKind.None]: "",
};

const SPINNER_KINDS: StatusKind[] = [
  StatusKind.Cache,
  StatusKind.Fetch,
  StatusKind.Mutation,
];

export default function StatusBar() {
  const { statuses } = useStore();
  const visible = Object.values(statuses).filter((st) => st.msg);
  if (visible.length === 0) return null;

  return (
    <div className={s.bar}>
      {visible.map((st) => (
        <div key={st.id} className={`${s.status} ${KIND_CLASS[st.kind]}`}>
          {SPINNER_KINDS.includes(st.kind) && (
            <span
              className={`${s.spinner} ${s.spinnerSm}`}
              aria-hidden="true"
            />
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
