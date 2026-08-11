import WeekGrid from "../components/blocks/WeekGrid/WeekGrid";
import WeekNav from "../components/atoms/WeekNav/WeekNav";
import AddRowBar from "../components/blocks/AddRowBar/AddRowBar";
import StatusBar from "../components/atoms/StatusBar/StatusBar";
import styles from "../components/App.module.scss";
import { useAppState } from "../context/AppContext";

export default function HomePage() {
  const { initialized } = useAppState();

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div>
          <h1>⏱ Weekly Time Entry</h1>
          <p className={styles.subtitle}>NetSuite — fast entry</p>
        </div>
        <button
          className={styles.linkBtn}
          onClick={() => {
            sessionStorage.setItem("ft_bypass", "1");
            window.location.reload();
          }}
        >
          Load original page →
        </button>
      </header>

      <WeekNav />
      <StatusBar />
      <WeekGrid />
      {initialized && <AddRowBar />}

      <footer className={styles.footer}>
        Fast Time Tracker · <a href={window.location.origin}>NetSuite Home</a>
      </footer>
    </div>
  );
}
