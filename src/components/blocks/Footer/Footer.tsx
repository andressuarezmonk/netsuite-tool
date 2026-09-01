import { useEffect, useState } from "react";
import {
  VersionService,
  type VersionCheckResult,
} from "@/services/version.service";
import styles from "./Footer.module.scss";

export default function Footer() {
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

  return (
    <footer className={styles.footer}>
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
