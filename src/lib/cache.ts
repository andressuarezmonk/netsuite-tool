/**
 * Persistent cache for week data using chrome.storage.local.
 * Keys are "week_<mondayISO>" (e.g. "week_2026-07-27").
 * Each entry stores the WeekData plus a timestamp.
 */

import type { WeekData } from "./types";

const PREFIX = "week_";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — evict old weeks automatically

interface CacheEntry {
  data: WeekData;
  cachedAt: number;
}

function key(mondayISO: string): string {
  return PREFIX + mondayISO;
}

export async function getCached(mondayISO: string): Promise<WeekData | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key(mondayISO), (result) => {
      const entry = result[key(mondayISO)] as CacheEntry | undefined;
      if (!entry) {
        resolve(null);
        return;
      }
      // Evict if too old
      if (Date.now() - entry.cachedAt > MAX_AGE_MS) {
        chrome.storage.local.remove(key(mondayISO));
        resolve(null);
        return;
      }
      resolve(entry.data);
    });
  });
}

export async function setCached(
  mondayISO: string,
  data: WeekData,
): Promise<void> {
  return new Promise((resolve) => {
    const entry: CacheEntry = { data, cachedAt: Date.now() };
    chrome.storage.local.set({ [key(mondayISO)]: entry }, resolve);
  });
}

export async function evictOldWeeks(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (items) => {
      const toRemove: string[] = [];
      for (const [k, v] of Object.entries(items)) {
        if (!k.startsWith(PREFIX)) continue;
        const entry = v as CacheEntry;
        if (Date.now() - entry.cachedAt > MAX_AGE_MS) toRemove.push(k);
      }
      if (toRemove.length > 0) {
        chrome.storage.local.remove(toRemove, resolve);
      } else {
        resolve();
      }
    });
  });
}
