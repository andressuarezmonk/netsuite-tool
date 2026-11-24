/**
 * Checks whether a newer version of the extension is available by calling
 * the GitHub REST API, which serves proper CORS headers and is safe to call
 * directly from a content script.
 *
 * The VS Code extension is released from the same repository (tags `ide-v*`),
 * so this looks through the release list for the newest *web* release (`v*`)
 * instead of trusting `/releases/latest`.
 */

const REPOSITORY_URL = "https://github.com/andressuarezmonk/netsuite-tool";
const GITHUB_RELEASES_API_URL =
  "https://api.github.com/repos/andressuarezmonk/netsuite-tool/releases?per_page=30";
const FALLBACK_RELEASE_URL = `${REPOSITORY_URL}/releases/latest`;
// Only plain `vX.Y.Z` tags are web releases; `ide-vX.Y.Z` must never match
const WEB_TAG_PATTERN = /^v(\d+\.\d+\.\d+)$/;

export interface VersionCheckResult {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  releaseUrl: string;
}

export interface GitHubRelease {
  tag_name: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
}

function parseVersion(versionString: string): number[] {
  return versionString.split(".").map((part) => parseInt(part, 10));
}

export function isNewer(latest: string, current: string): boolean {
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

/** The highest published web release in a GitHub release list, if any. */
export function findNewestWebRelease(
  releases: GitHubRelease[],
): { version: string; url: string } | null {
  let newest: { version: string; url: string } | null = null;
  releases.forEach((release) => {
    if (release.draft || release.prerelease) return;
    const version = WEB_TAG_PATTERN.exec(release.tag_name)?.[1];
    if (!version) return;
    if (newest === null || isNewer(version, newest.version)) {
      newest = { version, url: release.html_url ?? FALLBACK_RELEASE_URL };
    }
  });
  return newest;
}

export const VersionService = {
  async check(): Promise<VersionCheckResult | null> {
    const currentVersion = chrome.runtime.getManifest().version;

    try {
      const response = await fetch(GITHUB_RELEASES_API_URL, {
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) return null;

      const releases = (await response.json()) as GitHubRelease[];
      const newestWebRelease = findNewestWebRelease(releases);
      if (!newestWebRelease) return null;

      return {
        hasUpdate: isNewer(newestWebRelease.version, currentVersion),
        latestVersion: newestWebRelease.version,
        currentVersion,
        releaseUrl: newestWebRelease.url,
      };
    } catch {
      return null;
    }
  },
};
