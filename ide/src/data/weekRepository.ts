import type * as vscode from "vscode";
import type {
  BridgeErrorCode,
  DeleteRowParams,
  SetDayHoursParams,
  WeekResult,
} from "@protocol";

/** Where the link to the Chrome extension stands. */
export type RepositoryStatus =
  | "notPaired" // no pairing token yet
  | "waiting" // paired, but Chrome isn't connected
  | "connected";

export type RepositoryErrorCode = BridgeErrorCode | "NOT_CONNECTED";

export class RepositoryError extends Error {
  code: RepositoryErrorCode;

  constructor(code: RepositoryErrorCode, message: string) {
    super(message);
    this.name = "RepositoryError";
    this.code = code;
  }
}

/**
 * Everything the UI needs from NetSuite. The real implementation talks to the
 * Chrome extension over the bridge; a mock exists for UI development.
 */
export interface WeekRepository {
  readonly status: RepositoryStatus;
  readonly onDidChangeStatus: vscode.Event<RepositoryStatus>;
  /** The NetSuite account Chrome is using, once known. */
  readonly accountOrigin: string | null;
  getWeek(mondayISO: string): Promise<WeekResult>;
  setDayHours(params: SetDayHoursParams): Promise<WeekResult>;
  deleteRow(params: DeleteRowParams): Promise<WeekResult>;
}
