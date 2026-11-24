export enum StatusKind {
  Cache = "cache",
  Fetch = "fetch",
  Mutation = "mutation",
  Success = "success",
  Error = "error",
  None = "",
}

export interface StatusEntry {
  id: string;
  msg: string;
  kind: StatusKind;
}
