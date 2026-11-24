// Finds out whether a newer release of this extension exists. A VSIX doesn't
// update itself, so the extension looks at its own GitHub releases.
// No `vscode` import: pure, testable.

import { RELEASES_API_URL, IDE_RELEASES_URL } from "@/constants";
import { compareVersions } from "@/utils/versions";

/** Only `ide-vX.Y.Z` tags are releases of this extension (not the Chrome one's `vX.Y.Z`). */
const IDE_TAG_PATTERN = /^ide-v(\d+\.\d+\.\d+)$/;

export interface GitHubRelease {
  tag_name: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  latestVersion: string;
  releaseUrl: string;
}

export function findNewestIdeRelease(
  releases: GitHubRelease[],
): { version: string; url: string } | null {
  let newest: { version: string; url: string } | null = null;
  releases.forEach((release) => {
    if (release.draft || release.prerelease) return;
    const version = IDE_TAG_PATTERN.exec(release.tag_name)?.[1];
    if (!version) return;
    if (newest === null || compareVersions(version, newest.version) > 0) {
      newest = { version, url: release.html_url ?? IDE_RELEASES_URL };
    }
  });
  return newest;
}

/** Resolves to null when offline, rate limited, or nothing is published. */
export async function checkForIdeUpdate(
  currentVersion: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<UpdateCheckResult | null> {
  try {
    const response = await fetchImplementation(RELEASES_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return null;
    const newest = findNewestIdeRelease(
      (await response.json()) as GitHubRelease[],
    );
    if (!newest) return null;
    return {
      hasUpdate: compareVersions(newest.version, currentVersion) > 0,
      latestVersion: newest.version,
      releaseUrl: newest.url,
    };
  } catch {
    return null;
  }
}
