import type { Event } from "@/utils/events";
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
  | "portInUse" // can't listen: another program or VS Code window has the port
  | "incompatible" // Chrome connected but its version can't work with this one
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
  readonly onDidChangeStatus: Event<RepositoryStatus>;
  /** Human-readable detail for the current non-connected status, if any. */
  readonly statusDetail?: string;
  /** The NetSuite account Chrome is using, once known. */
  readonly accountOrigin: string | null;
  getWeek(mondayISO: string): Promise<WeekResult>;
  setDayHours(params: SetDayHoursParams): Promise<WeekResult>;
  deleteRow(params: DeleteRowParams): Promise<WeekResult>;
}
