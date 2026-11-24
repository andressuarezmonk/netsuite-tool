// Owns the WebSocket to the VS Code extension. Runs in the background service
// worker, so it may only import window-free modules.
//
// Chrome connects out to VS Code (a browser can't be dialed into). The worker
// is kept alive by the keepalive traffic, and revived after Chrome terminates
// it by a chrome.alarms alarm that reconnects.
//
// Anything on this machine can listen on the port, so the server is never
// trusted until it has proved it knows the pairing token (see protocol.ts).
// Until then no request is acted on and nothing secret is sent.

import {
  BRIDGE_REQUEST_TYPES,
  CLOSE_CODE_INCOMPATIBLE,
  CLOSE_CODE_SERVER_NOT_VERIFIED,
  CLOSE_CODE_UNAUTHORIZED,
  KEEPALIVE_INTERVAL_MS,
  PROTOCOL_VERSION,
  computeProof,
  generateNonce,
  verifyProof,
  type BridgeRequestEnvelope,
  type BridgeRequestType,
  type ClientMessage,
} from "@protocol";
import {
  BridgeSettingsService,
  STORAGE_KEY_BRIDGE_SETTINGS,
  type BridgeConnectionState,
  type BridgeSettings,
} from "@/services/bridgeSettings.service";
import { isRecord } from "@/utils/guards";
import { handleBridgeRequest, toBadRequestResponse } from "./handlers";

const RECONNECT_ALARM_NAME = "ft_bridge_reconnect";
const RECONNECT_ALARM_PERIOD_MINUTES = 0.5; // Chrome's minimum
const RETRY_DELAY_MS = 5_000;

/** Where a socket is in the handshake. Requests are only honoured at "ready". */
type HandshakeStage =
  "awaitingChallenge" | "verifying" | "awaitingWelcome" | "ready";

interface SocketSession {
  clientNonce: string;
  stage: HandshakeStage;
  /** True once the server has proved it knows the token. */
  isServerVerified: boolean;
  /** True when the server failed that proof (wrong token, or an impostor). */
  hasFailedVerification: boolean;
}

let socket: WebSocket | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let connectInFlight: Promise<void> | null = null;
let isConnectRerunNeeded = false;
let lastWrittenState: BridgeConnectionState | null = null;
// Settings VS Code already refused. Retrying them would just be refused again;
// a settings change (re-pairing) clears this.
let rejectedSettingsKey: string | null = null;

const buildSettingsKey = (settings: BridgeSettings) =>
  `${settings.port}:${settings.token}`;

async function writeState(state: BridgeConnectionState): Promise<void> {
  if (state === lastWrittenState) return;
  lastWrittenState = state;
  await BridgeSettingsService.setState(state);
}

function stopTimers(): void {
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  if (retryTimer) clearTimeout(retryTimer);
  keepaliveTimer = null;
  retryTimer = null;
}

function closeSocket(): void {
  stopTimers();
  const socketToClose = socket;
  socket = null; // set first so its close event is recognised as ours
  socketToClose?.close();
}

function sendMessage(targetSocket: WebSocket, message: ClientMessage): void {
  if (targetSocket.readyState === WebSocket.OPEN) {
    targetSocket.send(JSON.stringify(message));
  }
}

function isRequestType(value: unknown): value is BridgeRequestType {
  return BRIDGE_REQUEST_TYPES.some((requestType) => requestType === value);
}

// ── Handshake ────────────────────────────────────────────────────────────────

async function handleChallenge(
  sourceSocket: WebSocket,
  session: SocketSession,
  settings: BridgeSettings,
  settingsKey: string,
  message: Record<string, unknown>,
): Promise<void> {
  session.stage = "verifying";
  const { protocolVersion, serverNonce, serverProof } = message;

  const isServerProven =
    typeof protocolVersion === "number" &&
    typeof serverNonce === "string" &&
    (await verifyProof(
      settings.token,
      "server",
      protocolVersion,
      session.clientNonce,
      serverNonce,
      serverProof,
    ));
  if (socket !== sourceSocket) return; // closed or replaced while verifying

  if (!isServerProven) {
    // Wrong token, or something that isn't our VS Code is on the port. We have
    // sent nothing secret; just hang up. Retries stay alarm-driven only.
    session.hasFailedVerification = true;
    await writeState("untrusted");
    sourceSocket.close(CLOSE_CODE_SERVER_NOT_VERIFIED, "Server not verified");
    return;
  }
  session.isServerVerified = true;

  // Only a verified server may make us give up on these settings.
  if (protocolVersion !== PROTOCOL_VERSION) {
    rejectedSettingsKey = settingsKey;
    await writeState("incompatible");
    sourceSocket.close(CLOSE_CODE_INCOMPATIBLE, "Protocol version mismatch");
    return;
  }

  const clientProof = await computeProof(
    settings.token,
    "client",
    PROTOCOL_VERSION,
    session.clientNonce,
    serverNonce as string,
  );
  if (socket !== sourceSocket) return;
  sendMessage(sourceSocket, { type: "auth", clientProof });
  session.stage = "awaitingWelcome";
}

async function handleRequest(
  sourceSocket: WebSocket,
  message: Record<string, unknown>,
): Promise<void> {
  if (typeof message.id !== "string") return;
  if (!isRequestType(message.type) || !isRecord(message.params)) {
    sendMessage(
      sourceSocket,
      toBadRequestResponse(message.id, "Unknown or malformed request."),
    );
    return;
  }

  // Params are validated per request inside the handlers.
  const envelope = {
    id: message.id,
    type: message.type,
    params: message.params,
  } as BridgeRequestEnvelope;
  sendMessage(sourceSocket, await handleBridgeRequest(envelope));
}

async function handleServerMessage(
  sourceSocket: WebSocket,
  session: SocketSession,
  settings: BridgeSettings,
  settingsKey: string,
  rawData: string,
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    return;
  }
  if (!isRecord(parsed)) return;

  switch (session.stage) {
    case "awaitingChallenge":
      if (parsed.type === "challenge") {
        await handleChallenge(
          sourceSocket,
          session,
          settings,
          settingsKey,
          parsed,
        );
      }
      return;
    case "awaitingWelcome":
      if (parsed.type === "welcome") {
        session.stage = "ready";
        await writeState("connected");
        keepaliveTimer = setInterval(
          () => sendMessage(sourceSocket, { type: "keepalive" }),
          KEEPALIVE_INTERVAL_MS,
        );
      }
      return;
    case "ready":
      if (parsed.type === "keepalive-ack") return;
      await handleRequest(sourceSocket, parsed);
      return;
    case "verifying":
      return; // anything arriving mid-verification is not trusted yet
  }
}

// ── Connection lifecycle ─────────────────────────────────────────────────────

async function connect(): Promise<void> {
  const settings = await BridgeSettingsService.getSettings();

  if (!settings.enabled) {
    closeSocket();
    await chrome.alarms.clear(RECONNECT_ALARM_NAME);
    await writeState("off");
    return;
  }

  // The alarm is what revives the worker after Chrome terminates it.
  if (!(await chrome.alarms.get(RECONNECT_ALARM_NAME))) {
    await chrome.alarms.create(RECONNECT_ALARM_NAME, {
      periodInMinutes: RECONNECT_ALARM_PERIOD_MINUTES,
    });
  }

  const settingsKey = buildSettingsKey(settings);
  if (rejectedSettingsKey === settingsKey) return;
  const isAlreadyConnecting =
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING;
  if (isAlreadyConnecting) return;

  await writeState("connecting");
  const newSocket = new WebSocket(`ws://127.0.0.1:${settings.port}`);
  socket = newSocket;
  const session: SocketSession = {
    clientNonce: generateNonce(),
    stage: "awaitingChallenge",
    isServerVerified: false,
    hasFailedVerification: false,
  };

  newSocket.addEventListener("open", () => {
    sendMessage(newSocket, {
      type: "hello",
      protocolVersion: PROTOCOL_VERSION,
      extensionVersion: chrome.runtime.getManifest().version,
      clientNonce: session.clientNonce,
    });
  });

  newSocket.addEventListener("message", (messageEvent) => {
    if (socket !== newSocket) return;
    handleServerMessage(
      newSocket,
      session,
      settings,
      settingsKey,
      String(messageEvent.data),
    );
  });

  newSocket.addEventListener("close", async (closeEvent) => {
    if (socket !== newSocket) return; // closed on purpose, or already replaced
    stopTimers();
    socket = null;

    // Close codes are only believed from a server that proved itself —
    // otherwise an impostor could switch us off just by hanging up with 4001.
    if (session.isServerVerified) {
      if (closeEvent.code === CLOSE_CODE_UNAUTHORIZED) {
        rejectedSettingsKey = settingsKey;
        await writeState("unauthorized");
        return;
      }
      if (closeEvent.code === CLOSE_CODE_INCOMPATIBLE) {
        rejectedSettingsKey = settingsKey;
        await writeState("incompatible");
        return;
      }
    }
    // State is already "untrusted"; only the 30s alarm retries from here, so
    // an impostor squatting on the port isn't hammered every few seconds.
    if (session.hasFailedVerification) return;

    await writeState("connecting");
    retryTimer = setTimeout(requestConnect, RETRY_DELAY_MS);
  });
}

/**
 * Serialises connect() so the alarm, retries and settings changes can't race.
 * A request that arrives while a run is in flight triggers one more run
 * afterwards — that run may have read settings which have since changed.
 */
function requestConnect(): Promise<void> {
  if (connectInFlight) {
    isConnectRerunNeeded = true;
    return connectInFlight;
  }
  connectInFlight = connect()
    .catch((error) => console.error("[bridge] connect failed", error))
    .finally(() => {
      connectInFlight = null;
      if (isConnectRerunNeeded) {
        isConnectRerunNeeded = false;
        requestConnect();
      }
    });
  return connectInFlight;
}

/** Call once, synchronously, at the top level of the service worker. */
export function initBridge(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RECONNECT_ALARM_NAME) requestConnect();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !(STORAGE_KEY_BRIDGE_SETTINGS in changes)) {
      return;
    }
    rejectedSettingsKey = null;
    closeSocket();
    requestConnect();
  });

  requestConnect();
}
