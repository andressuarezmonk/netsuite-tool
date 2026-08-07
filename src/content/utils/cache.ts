/**
 * Persistent cache for week data using chrome.storage.local.
 * Storage keys follow the pattern "week_<mondayISO>" (e.g. "week_2026-07-27").
 * Each entry stores the WeekData alongside the timestamp it was cached at,
 * so stale entries can be evicted automatically.
 */

import type { WeekData } from "./types";
import { storageGet, storageSet, storageRemove } from "./chromeStorage";

const STORAGE_KEY_PREFIX = "week_";
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface WeekCacheEntry {
  weekData: WeekData;
  cachedAtTimestamp: number;
}

const buildStorageKey = (mondayISO: string) => STORAGE_KEY_PREFIX + mondayISO;

const isExpired = (entry: WeekCacheEntry) =>
  Date.now() - entry.cachedAtTimestamp > MAX_CACHE_AGE_MS;

export async function getCached(mondayISO: string): Promise<WeekData | null> {
  const storageKey = buildStorageKey(mondayISO);
  const storageResult = await storageGet(storageKey);
  const cachedEntry = storageResult[storageKey] as WeekCacheEntry | undefined;

  if (!cachedEntry) return null;

  if (isExpired(cachedEntry)) {
    await storageRemove(storageKey);
    return null;
  }

  return cachedEntry.weekData;
}

export async function setCached(
  mondayISO: string,
  weekData: WeekData,
): Promise<void> {
  const storageKey = buildStorageKey(mondayISO);
  const entryToStore: WeekCacheEntry = {
    weekData,
    cachedAtTimestamp: Date.now(),
  };
  await storageSet({ [storageKey]: entryToStore });
}

export async function evictOldWeeks(): Promise<void> {
  const allStorageItems = await storageGet(null);
  const expiredKeys: string[] = [];

  for (const [storageKey, storedValue] of Object.entries(allStorageItems)) {
    if (!storageKey.startsWith(STORAGE_KEY_PREFIX)) continue;

    const cachedEntry = storedValue as WeekCacheEntry;
    if (isExpired(cachedEntry)) {
      expiredKeys.push(storageKey);
    }
  }

  if (expiredKeys.length > 0) {
    await storageRemove(expiredKeys);
  }
}
