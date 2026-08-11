import styles from "./Header.module.scss";

export default function Header() {
  return (
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
  );
}
