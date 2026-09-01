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
      if (result?.hasUpdate) {
        setVersionCheck(result);
      }
    });
  }, []);

  return (
    <footer className={styles.footer}>
      {versionCheck && (
        <span className={styles.updateBanner}>
          ↑ v{versionCheck.latestVersion} available —{" "}
          <a href={versionCheck.releaseUrl} target="_blank" rel="noreferrer">
            download
          </a>
        </span>
      )}
      Fast Time Tracker · <a href={window.location.origin}>NetSuite Home</a>
    </footer>
  );
}
