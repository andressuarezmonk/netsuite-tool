/**
 * Status channel IDs — used as keys in the statuses map.
 * Each ID corresponds to a distinct concern so they can be shown/cleared
 * independently (e.g. cache and mutation can be visible at the same time).
 */
export enum StatusId {
  Init = "init",
  Cache = "cache",
  Fetch = "fetch",
  Mutation = "mutation",
}
