// Window- and vscode-free constants shared by the extension and the bridge.

const REPOSITORY_PATH = "andressuarezmonk/netsuite-tool";
export const REPOSITORY_URL = `https://github.com/${REPOSITORY_PATH}`;

/**
 * Shown next to the view title and as a note under the content while the
 * extension is in beta. Set to "" once it is stable and the label disappears.
 */
export const STAGE_LABEL = "beta";
export const ISSUES_URL = `${REPOSITORY_URL}/issues/new`;

/** The Chrome extension's releases (the repository's "latest" release). */
export const WEB_RELEASES_URL = `${REPOSITORY_URL}/releases/latest`;
/**
 * This extension's releases (tags `ide-vX.Y.Z`). GitHub's release search
 * matches whole words, so a partial tag like "ide-v" finds nothing; the phrase
 * below is in the title of every VS Code release (see ide-release.yml).
 */
export const IDE_RELEASES_URL = `${REPOSITORY_URL}/releases?q=VS%20Code%20extension`;
export const RELEASES_API_URL = `https://api.github.com/repos/${REPOSITORY_PATH}/releases?per_page=30`;

/**
 * The oldest Chrome extension this version works with — the first web release
 * that contains the VS Code bridge. The release script and CI refuse to
 * publish a VS Code release unless a web release at least this new exists, so
 * nobody can be offered this extension before the Chrome extension it needs.
 */
export const MIN_CHROME_EXTENSION_VERSION = "1.9.0";
