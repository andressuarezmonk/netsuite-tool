/**
 * Persistent cache for week data using chrome.storage.local.
 * Storage keys follow the pattern "week_<mondayISO>" (e.g. "week_2026-07-27").
 * Each entry stores the WeekData alongside the timestamp it was cached at,
 * so stale entries can be evicted automatically.
 */

import type { WeekData, Project, Task } from "../utils/types";
import { storageGet, storageSet, storageRemove } from "./chromeStorage.service";
import { loadWeek } from "./week.service";
import { mergeWeekData } from "../utils/merge";

const STORAGE_KEY_PREFIX = "week_";
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface WeekCacheEntry {
  weekData: WeekData;
  cachedAtTimestamp: number;
}

const buildStorageKey = (mondayISO: string) => STORAGE_KEY_PREFIX + mondayISO;

const isExpired = (entry: WeekCacheEntry) =>
  Date.now() - entry.cachedAtTimestamp > MAX_CACHE_AGE_MS;

const getCached = async (mondayISO: string): Promise<WeekData | null> => {
  const storageKey = buildStorageKey(mondayISO);
  const storageResult = await storageGet(storageKey);
  const cachedEntry = storageResult[storageKey] as WeekCacheEntry | undefined;

  if (!cachedEntry) return null;

  if (isExpired(cachedEntry)) {
    await storageRemove(storageKey);
    return null;
  }

  return cachedEntry.weekData;
};

async function setCached(mondayISO: string, weekData: WeekData): Promise<void> {
  const storageKey = buildStorageKey(mondayISO);
  const entryToStore: WeekCacheEntry = {
    weekData,
    cachedAtTimestamp: Date.now(),
  };
  await storageSet({ [storageKey]: entryToStore });
}

async function evictOldWeeks(): Promise<void> {
  const allStorageItems = await storageGet(null);

  const expiredKeys = Object.entries(allStorageItems)
    .filter(([storageKey]) => storageKey.startsWith(STORAGE_KEY_PREFIX))
    .filter(([, storedValue]) => isExpired(storedValue as WeekCacheEntry))
    .map(([storageKey]) => storageKey);

  if (expiredKeys.length === 0) return;

  await storageRemove(expiredKeys);
}

// ── Cache-first fetch strategy ────────────────────────────────────────────────

interface CachedWeekResult {
  cached: WeekData | null;
  fresh: WeekData;
  merged: WeekData;
  projects: Project[];
  tasks: Record<string, Task[]>;
}

/**
 * Fetches fresh week data from the server, stores it in the cache, and merges
 * it with any currently displayed data to preserve unsaved local edits.
 */

async function fetchAndCacheWeek(
  mondayISO: string,
  userId: string,
  defaultItemId: string,
  displayedWeekData: WeekData | null,
  localEdits: Map<string, number>,
): Promise<CachedWeekResult> {
  const cached = await getCached(mondayISO);
  const {
    weekData: fresh,
    projects,
    tasks,
  } = await loadWeek(mondayISO, userId, defaultItemId);
  await setCached(mondayISO, fresh);
  const merged = displayedWeekData
    ? mergeWeekData(displayedWeekData, fresh, localEdits)
    : fresh;
  return { cached, fresh, merged, projects, tasks };
}

export const CacheService = {
  getCached,
  setCached,
  evictOldWeeks,
  fetchAndCacheWeek,
};
