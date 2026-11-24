/**
 * The NetSuite account this extension talks to: the origin requests go to and
 * the URL of the data handler script that serves them.
 *
 * Window-free, so the background service worker can use it too. The page sets
 * the connection synchronously from its own URL (no race with the async
 * storage write); any other context falls back to the last one the page
 * persisted in chrome.storage.
 */

import { ChromeStorage } from "./chromeStorage.service";

export interface NetSuiteConnection {
  origin: string; // e.g. "https://3851137.app.netsuite.com"
  handlerUrl: string; // full URL of the data handler, incl. script + deploy
}

const STORAGE_KEY_CONNECTION = "ns_connection";

export class NotConfiguredError extends Error {
  constructor() {
    super(
      "No NetSuite account known yet. Open the NetSuite time entry page once.",
    );
    this.name = "NotConfiguredError";
  }
}

let currentConnection: NetSuiteConnection | null = null;

function isNetSuiteConnection(value: unknown): value is NetSuiteConnection {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<NetSuiteConnection>;
  return (
    typeof candidate.origin === "string" &&
    typeof candidate.handlerUrl === "string"
  );
}

async function get(): Promise<NetSuiteConnection> {
  if (currentConnection) return currentConnection;

  const storageResult = await ChromeStorage.storageGet(STORAGE_KEY_CONNECTION);
  const storedConnection = storageResult[STORAGE_KEY_CONNECTION];
  if (!isNetSuiteConnection(storedConnection)) throw new NotConfiguredError();

  currentConnection = storedConnection;
  return storedConnection;
}

/** Sets the connection immediately in memory and persists it for other contexts. */
function set(connection: NetSuiteConnection): Promise<void> {
  currentConnection = connection;
  return ChromeStorage.storageSet({ [STORAGE_KEY_CONNECTION]: connection });
}

export const ConnectionService = { get, set };
