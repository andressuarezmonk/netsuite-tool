import type { VersionCheckResult } from "@/services/version.service";

export const MOCK_VERSION_CHECK: VersionCheckResult = {
  hasUpdate: true,
  latestVersion: "2.0.0",
  currentVersion: "1.0.0",
  releaseUrl:
    "https://github.com/andressuarezmonk/netsuite-tool/releases/latest",
};
