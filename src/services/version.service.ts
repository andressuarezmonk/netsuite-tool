/**
 * Checks whether a newer version of the extension is available by calling
 * the GitHub REST API, which serves proper CORS headers and is safe to call
 * directly from a content script.
 */

const GITHUB_API_URL =
  "https://api.github.com/repos/andressuarezmonk/netsuite-tool/releases/latest";

export interface VersionCheckResult {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  releaseUrl: string;
}

interface GitHubRelease {
  tag_name: string;
}

function parseVersion(versionString: string): number[] {
  return versionString.split(".").map((part) => parseInt(part, 10));
}

function isNewer(latest: string, current: string): boolean {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  const length = Math.max(latestParts.length, currentParts.length);

  for (let index = 0; index < length; index++) {
    const latestPart = latestParts[index] ?? 0;
    const currentPart = currentParts[index] ?? 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  return false;
}

export const VersionService = {
  async check(): Promise<VersionCheckResult | null> {
    const currentVersion = chrome.runtime.getManifest().version;

    try {
      const response = await fetch(GITHUB_API_URL, {
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) return null;

      const data = (await response.json()) as GitHubRelease;
      const latestVersion = data.tag_name.replace(/^v/, "");

      return {
        hasUpdate: isNewer(latestVersion, currentVersion),
        latestVersion,
        currentVersion,
        releaseUrl:
          "https://github.com/andressuarezmonk/netsuite-tool/releases/latest",
      };
    } catch {
      return null;
    }
  },
};
