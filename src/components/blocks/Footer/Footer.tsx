import styles from "./Footer.module.scss";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      Fast Time Tracker · <a href={window.location.origin}>NetSuite Home</a>
    </footer>
  );
}
