// Kept free of any `window` access so it is safe to import from the
// background service worker (utils/constants.ts is not).

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAYS)[number];
