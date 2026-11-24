import { useEffect, useState } from "react";
import {
  VersionService,
  type VersionCheckResult,
} from "@/services/version.service";
import { useTheme } from "@/hooks/useTheme";
import styles from "./Footer.module.scss";

export default function Footer() {
  const { theme, toggleTheme } = useTheme();
  const [versionCheck, setVersionCheck] = useState<VersionCheckResult | null>(
    null,
  );

  useEffect(() => {
    VersionService.check().then((result) => {
      setVersionCheck(result);
    });
  }, []);

  const currentVersion = chrome.runtime.getManifest().version;
  const hasUpdate = versionCheck?.hasUpdate ?? false;
  const isDark = theme === "dark";

  return (
    <footer className={styles.footer}>
      <button
        type="button"
        className={styles.themeToggle}
        onClick={toggleTheme}
        aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
        title={`Switch to ${isDark ? "light" : "dark"} mode`}
      >
        {isDark ? "☀ Light" : "☾ Dark"}
      </button>
      <span className={hasUpdate ? styles.versionUpdate : styles.version}>
        v{currentVersion}
        {hasUpdate && versionCheck && (
          <>
            {" "}
            · ↑ v{versionCheck.latestVersion} available —{" "}
            <a href={versionCheck.releaseUrl} target="_blank" rel="noreferrer">
              download
            </a>
          </>
        )}
      </span>
      Fast Time Tracker · <a href={window.location.origin}>NetSuite Home</a>
    </footer>
  );
}
