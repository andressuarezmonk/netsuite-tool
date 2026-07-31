// All NS-specific values are derived at runtime from the page URL,
// so the extension works for any NetSuite account without code changes.

// The content script runs on the NS time entry page, so window.location gives us:
//   hostname: "3851137.app.netsuite.com"  -> account ID
//   search:   "?script=2375&deploy=1..."  -> entry script ID
//
// The data handler script ID is stored in chrome.storage when the page loads
// (set in index.tsx after reading it from the page source).

export function getAccountId(): string {
  return window.location.hostname.split('.')[0];
}

export function getNSBaseUrl(): string {
  return window.location.origin;
}

// The handler URL is built from values stored by the content script on first load.
// Falls back to the convention of TARGET_SCRIPT - 2 if storage hasn't been set yet.
export function getHandler(): string {
  // Read from module-level cache set by initHandler()
  return _handler;
}

let _handler = buildDefaultHandler();

function buildDefaultHandler(): string {
  const params = new URLSearchParams(window.location.search);
  const scriptId = parseInt(params.get('script') ?? '2375', 10);
  const handlerScript = scriptId - 2; // convention: 2375 -> 2373
  return `${window.location.origin}/app/site/hosting/scriptlet.nl?script=${handlerScript}&deploy=1`;
}

/** Call this once the actual handler script ID is known (read from page source). */
export function setHandlerScriptId(scriptId: string): void {
  _handler = `${window.location.origin}/app/site/hosting/scriptlet.nl?script=${scriptId}&deploy=1`;
}

export const TARGET_SCRIPT = '2375';
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = typeof DAYS[number];
