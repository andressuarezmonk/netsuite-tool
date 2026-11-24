// The real data source: asks the Chrome extension for hours over the bridge.
// No `vscode` import, so it can be tested in plain Node together with the
// real Chrome-side code.

import {
  PROTOCOL_VERSION,
  type BridgeRequestEnvelope,
  BridgeRequestMap,
  BridgeRequestType,
  BridgeResponse,
  DeleteRowParams,
  SetDayHoursParams,
  StatusResult,
  WeekResult,
} from "@protocol";
import {
  createBridgeServer,
  isAddressInUseError,
  type BridgeConnection,
  type BridgeServer,
  type ClientRejection,
} from "@/bridge/server";
import { SimpleEventEmitter, type Disposable } from "@/utils/events";
import { isRecord } from "@/utils/guards";
import { parseVersion } from "@/utils/versions";
import {
  RepositoryError,
  type RepositoryStatus,
  type WeekRepository,
} from "./weekRepository";

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const PORT_RETRY_INTERVAL_MS = 10_000;

export interface BridgeRepositoryOptions {
  /** The pairing token, or undefined when not paired. */
  getToken: () => Promise<string | undefined>;
  getPort: () => number;
  requestTimeoutMs?: number;
  portRetryIntervalMs?: number;
  handshakeTimeoutMs?: number;
  idleTimeoutMs?: number;
  /** Oldest Chrome extension version to accept; omit to accept any. */
  minimumChromeVersion?: string;
}

export interface BridgeRepository extends WeekRepository, Disposable {
  /** Starts or stops listening to match the current pairing state. */
  refresh(): Promise<void>;
  /** Re-binds the listener, e.g. after the port setting changed. */
  restart(): Promise<void>;
}

interface PendingRequest {
  connection: BridgeConnection;
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Turns a rejection into advice the user can act on. */
export function describeRejection(rejection: ClientRejection): string {
  // The version comes from the other side: only quote it back if it's sane
  const readableVersion =
    parseVersion(rejection.chromeExtensionVersion) !== null
      ? rejection.chromeExtensionVersion
      : "";
  if (rejection.reason === "chromeTooOld") {
    const yours = readableVersion
      ? `yours is v${readableVersion}`
      : "couldn't read your version";
    return `This VS Code extension needs Chrome extension v${rejection.minimumVersion} or newer (${yours}). Update the Chrome extension.`;
  }
  const chromeVersion = readableVersion ? ` (v${readableVersion})` : "";
  return rejection.chromeProtocolVersion > PROTOCOL_VERSION
    ? `Your Chrome extension${chromeVersion} is newer than this VS Code extension understands. Update the VS Code extension.`
    : `Your Chrome extension${chromeVersion} is older than this VS Code extension understands. Update the Chrome extension.`;
}

const unexpectedResponse = () =>
  new RepositoryError("NS_ERROR", "Chrome sent an unexpected response.");

/** Chrome is trusted after the handshake, but a malformed reply must not crash the UI. */
function parseWeekResult(data: unknown): WeekResult {
  const isValid =
    isRecord(data) &&
    typeof data.mondayISO === "string" &&
    typeof data.userId === "string" &&
    Array.isArray(data.rows) &&
    data.rows.every((row) => isRecord(row) && isRecord(row.days)) &&
    Array.isArray(data.projects) &&
    isRecord(data.tasksByProject) &&
    isRecord(data.holidays);
  if (!isValid) throw unexpectedResponse();
  return data as unknown as WeekResult;
}

export function createBridgeRepository(
  options: BridgeRepositoryOptions,
): BridgeRepository {
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const portRetryIntervalMs =
    options.portRetryIntervalMs ?? PORT_RETRY_INTERVAL_MS;
  const statusEmitter = new SimpleEventEmitter<RepositoryStatus>();
  const pendingRequests = new Map<string, PendingRequest>();

  let server: BridgeServer | null = null;
  let activeConnection: BridgeConnection | null = null;
  let isTokenPresent = false;
  let isPortInUse = false;
  let accountOrigin: string | null = null;
  let incompatibility: string | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let nextRequestId = 1;
  let lastPublishedStatus: RepositoryStatus = "notPaired";
  let isDisposed = false;
  // start/stop/refresh run one at a time so they can't interleave
  let operationQueue: Promise<unknown> = Promise.resolve();

  const computeStatus = (): RepositoryStatus => {
    if (!isTokenPresent) return "notPaired";
    if (activeConnection) return "connected";
    if (incompatibility !== null) return "incompatible";
    return isPortInUse ? "portInUse" : "waiting";
  };

  const publishStatus = () => {
    const status = computeStatus();
    if (status === lastPublishedStatus) return;
    lastPublishedStatus = status;
    statusEmitter.fire(status);
  };

  const rejectPendingRequests = (connection: BridgeConnection) => {
    pendingRequests.forEach((pending, requestId) => {
      if (pending.connection !== connection) return;
      clearTimeout(pending.timer);
      pendingRequests.delete(requestId);
      pending.reject(
        new RepositoryError("NOT_CONNECTED", "Chrome disconnected."),
      );
    });
  };

  const handleResponse = (
    connection: BridgeConnection,
    response: BridgeResponse,
  ) => {
    const pending = pendingRequests.get(response.id);
    // Only the connection that was asked may answer
    if (!pending || pending.connection !== connection) return;
    clearTimeout(pending.timer);
    pendingRequests.delete(response.id);
    if (response.ok) pending.resolve(response.data);
    else {
      pending.reject(
        new RepositoryError(response.error.code, response.error.message),
      );
    }
  };

  function request<Type extends BridgeRequestType>(
    type: Type,
    params: BridgeRequestMap[Type]["params"],
  ): Promise<unknown> {
    const connection = activeConnection;
    if (!connection) {
      return Promise.reject(
        new RepositoryError("NOT_CONNECTED", "Chrome is not connected."),
      );
    }
    const requestId = String(nextRequestId++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new RepositoryError("NETWORK", "Chrome didn't answer in time."));
      }, requestTimeoutMs);
      pendingRequests.set(requestId, { connection, resolve, reject, timer });
      // Correlated union: `type` and `params` always belong together here
      connection.send({
        id: requestId,
        type,
        params,
      } as BridgeRequestEnvelope);
    });
  }

  /** Learns which NetSuite account Chrome is using (for "Open NetSuite"). */
  async function fetchAccountOrigin(): Promise<void> {
    try {
      const data = await request("getStatus", {});
      const status = data as Partial<StatusResult> | null;
      accountOrigin =
        status && typeof status.accountOrigin === "string"
          ? status.accountOrigin
          : null;
    } catch {
      // Not essential: the week still loads without it
    }
  }

  const handleConnectionReady = (connection: BridgeConnection) => {
    // The server admits one connection at a time, so this is the only one
    activeConnection = connection;
    incompatibility = null;
    publishStatus();
    void fetchAccountOrigin();
  };

  const handleConnectionClosed = (connection: BridgeConnection) => {
    rejectPendingRequests(connection);
    if (activeConnection !== connection) return;
    activeConnection = null;
    publishStatus();
  };

  const clearRetryTimer = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };

  async function stopServer(): Promise<void> {
    clearRetryTimer();
    const serverToStop = server;
    server = null;
    isPortInUse = false;
    await serverToStop?.stop();
  }

  async function syncWithPairingState(): Promise<void> {
    if (isDisposed) return;
    isTokenPresent = (await options.getToken()) !== undefined;

    if (!isTokenPresent) {
      await stopServer();
      accountOrigin = null;
      incompatibility = null;
      publishStatus();
      return;
    }
    if (server) {
      publishStatus();
      return;
    }

    const newServer = createBridgeServer({
      port: options.getPort(),
      getToken: options.getToken,
      onConnectionReady: handleConnectionReady,
      onConnectionClosed: handleConnectionClosed,
      onResponse: handleResponse,
      handshakeTimeoutMs: options.handshakeTimeoutMs,
      minimumExtensionVersion: options.minimumChromeVersion,
      onClientRejected: (rejection) => {
        incompatibility = describeRejection(rejection);
        publishStatus();
      },
      idleTimeoutMs: options.idleTimeoutMs,
    });
    try {
      await newServer.start();
      server = newServer;
      isPortInUse = false;
    } catch (error) {
      isPortInUse = isAddressInUseError(error);
      if (!isPortInUse)
        console.error("[netsuite-tracker] bridge failed", error);
      // Another window may release the port later: keep trying
      retryTimer = setTimeout(() => void refresh(), portRetryIntervalMs);
    }
    publishStatus();
  }

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const result = operationQueue.then(operation);
    operationQueue = result.catch(() => undefined);
    return result;
  };

  const refresh = () => enqueue(syncWithPairingState);

  return {
    get status() {
      return computeStatus();
    },
    onDidChangeStatus: statusEmitter.event,
    get statusDetail() {
      return incompatibility ?? undefined;
    },
    get accountOrigin() {
      return accountOrigin;
    },

    refresh,

    restart: () =>
      enqueue(async () => {
        await stopServer();
        await syncWithPairingState();
      }),

    async getWeek(mondayISO: string) {
      return parseWeekResult(await request("getWeek", { mondayISO }));
    },

    async setDayHours(params: SetDayHoursParams) {
      return parseWeekResult(await request("setDayHours", params));
    },

    async deleteRow(params: DeleteRowParams) {
      return parseWeekResult(await request("deleteRow", params));
    },

    dispose() {
      isDisposed = true;
      clearRetryTimer();
      activeConnection?.close();
      void server?.stop();
      server = null;
      statusEmitter.dispose();
    },
  };
}
