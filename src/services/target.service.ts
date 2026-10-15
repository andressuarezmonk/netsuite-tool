/**
 * Persists the weekly hours target in localStorage (`ft_weekly_target`).
 * Falls back to DEFAULT_WEEKLY_TARGET when nothing valid is stored.
 */

const KEY_WEEKLY_TARGET = "ft_weekly_target";

export const DEFAULT_WEEKLY_TARGET = 40;
export const MAX_WEEKLY_TARGET = 168;

export function isValidWeeklyTarget(hours: number): boolean {
  return Number.isFinite(hours) && hours > 0 && hours <= MAX_WEEKLY_TARGET;
}

export const TargetService = {
  get(): number {
    const storedTarget = Number(window.localStorage.getItem(KEY_WEEKLY_TARGET));
    return isValidWeeklyTarget(storedTarget)
      ? storedTarget
      : DEFAULT_WEEKLY_TARGET;
  },

  set(hours: number): void {
    if (!isValidWeeklyTarget(hours)) return;
    window.localStorage.setItem(KEY_WEEKLY_TARGET, String(hours));
  },
};
