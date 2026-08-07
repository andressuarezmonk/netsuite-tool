/**
 * Promise-based wrappers around chrome.storage.local.
 * All chrome.storage APIs are callback-only; these helpers let callers use async/await instead.
 */

export function storageGet(
  keys: string | string[] | null,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) =>
    chrome.storage.local.get(
      keys,
      resolve as (items: Record<string, unknown>) => void,
    ),
  );
}

export function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

export function storageRemove(keys: string | string[]): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}
