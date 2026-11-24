// The VS Code side of the bridge: a WebSocket server the Chrome extension
// connects to. No `vscode` import, so it can be tested in plain Node.
//
// Security model (see protocol/protocol.ts). Any program on this machine can
// try to connect, so a client is never trusted until it has proved — with an
// HMAC, never by sending it — that it knows the pairing token:
//   - listen on 127.0.0.1 only;
//   - refuse browser Origins that aren't an extension (blocks web pages);
//   - challenge/response handshake before any request is sent;
//   - tight timeouts, a payload cap and a cap on unauthenticated sockets.

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  CLOSE_CODE_BUSY,
  CLOSE_CODE_INCOMPATIBLE,
  CLOSE_CODE_UNAUTHORIZED,
  KEEPALIVE_INTERVAL_MS,
  PROTOCOL_VERSION,
  computeProof,
  generateNonce,
  verifyProof,
  type BridgeRequestEnvelope,
  type BridgeResponse,
  type ServerMessage,
} from "@protocol";
import { isRecord } from "@/utils/guards";

const LOOPBACK_HOST = "127.0.0.1";
/** Browsers always send an Origin; ours is the extension's. Web pages are not. */
const ALLOWED_ORIGIN_PREFIX = "chrome-extension://";
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5_000;
// Chrome sends a keepalive every KEEPALIVE_INTERVAL_MS; silence for three
// intervals means the connection is dead (e.g. the laptop slept).
const DEFAULT_IDLE_TIMEOUT_MS = KEEPALIVE_INTERVAL_MS * 3 + 10_000;
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MAX_UNAUTHENTICATED_SOCKETS = 8;
const CLIENT_NONCE_PATTERN = /^[0-9a-f]{32}$/;

const CLOSE_CODE_POLICY = 1008;
const CLOSE_CODE_UNSUPPORTED = 1003;

/** One authenticated Chrome extension connection. */
export interface BridgeConnection {
  readonly extensionVersion: string;
  send(request: BridgeRequestEnvelope): void;
  close(): void;
}

export interface BridgeServerOptions {
  port: number;
  /** The pairing token, or undefined when not paired (then nobody gets in). */
  getToken: () => Promise<string | undefined>;
  onConnectionReady: (connection: BridgeConnection) => void;
  onConnectionClosed: (connection: BridgeConnection) => void;
  onResponse: (connection: BridgeConnection, response: BridgeResponse) => void;
  handshakeTimeoutMs?: number;
  idleTimeoutMs?: number;
}

export interface BridgeServer {
  /** Resolves once listening; rejects (e.g. EADDRINUSE) if it can't. */
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function isAddressInUseError(error: unknown): boolean {
  return isRecord(error) && (error as { code?: unknown }).code === "EADDRINUSE";
}

type Stage =
  "awaitingHello" | "awaitingAuth" | "verifying" | "ready" | "closed";

function isAllowedOrigin(origin: string | undefined): boolean {
  // No Origin means the client isn't a browser, so it can't be a web page; the
  // token handshake is what protects against other local programs.
  return origin === undefined || origin.startsWith(ALLOWED_ORIGIN_PREFIX);
}

function isResponse(value: Record<string, unknown>): boolean {
  if (typeof value.id !== "string" || typeof value.ok !== "boolean") {
    return false;
  }
  return value.ok || isRecord(value.error);
}

export function createBridgeServer(options: BridgeServerOptions): BridgeServer {
  const handshakeTimeoutMs =
    options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

  const webSocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD_BYTES,
  });
  const unauthenticatedSockets = new Set<WebSocket>();
  // One browser at a time: a second one waits until the first leaves, rather
  // than the two taking turns to kick each other out.
  let activeConnection: BridgeConnection | null = null;
  let httpServer: Server | null = null;

  function handleConnection(socket: WebSocket): void {
    let stage: Stage = "awaitingHello";
    let token = "";
    let clientNonce = "";
    let serverNonce = "";
    let clientProtocolVersion = 0;
    let extensionVersion = "";
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    // A function, because the socket can close while we await (TypeScript's
    // flow analysis can't see that)
    const isClosed = () => stage === "closed";

    unauthenticatedSockets.add(socket);
    const handshakeTimer = setTimeout(() => {
      if (stage !== "ready") socket.terminate();
    }, handshakeTimeoutMs);

    const connection: BridgeConnection = {
      get extensionVersion() {
        return extensionVersion;
      },
      send(request) {
        if (stage === "ready") socket.send(JSON.stringify(request));
      },
      close() {
        socket.close(1000, "Closed");
      },
    };

    const sendMessage = (message: ServerMessage) =>
      socket.send(JSON.stringify(message));

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => socket.terminate(), idleTimeoutMs);
    };

    async function handleHello(message: Record<string, unknown>) {
      const { protocolVersion, clientNonce: nonce } = message;
      const isValidHello =
        typeof protocolVersion === "number" &&
        typeof nonce === "string" &&
        CLIENT_NONCE_PATTERN.test(nonce);
      if (!isValidHello) return socket.close(CLOSE_CODE_POLICY, "Bad hello");

      const currentToken = await options.getToken();
      if (!currentToken) return socket.close(CLOSE_CODE_POLICY, "Not paired");
      if (isClosed()) return;

      token = currentToken;
      clientNonce = nonce;
      clientProtocolVersion = protocolVersion;
      extensionVersion =
        typeof message.extensionVersion === "string"
          ? message.extensionVersion.slice(0, 32)
          : "";
      serverNonce = generateNonce();
      stage = "awaitingAuth";
      sendMessage({
        type: "challenge",
        protocolVersion: PROTOCOL_VERSION,
        serverNonce,
        serverProof: await computeProof(
          token,
          "server",
          PROTOCOL_VERSION,
          clientNonce,
          serverNonce,
        ),
      });
    }

    async function handleAuth(message: Record<string, unknown>) {
      stage = "verifying";
      const isClientProven = await verifyProof(
        token,
        "client",
        PROTOCOL_VERSION,
        clientNonce,
        serverNonce,
        message.clientProof,
      );
      if (!isClientProven) {
        return socket.close(CLOSE_CODE_UNAUTHORIZED, "Bad proof");
      }
      if (clientProtocolVersion !== PROTOCOL_VERSION) {
        return socket.close(CLOSE_CODE_INCOMPATIBLE, "Protocol mismatch");
      }
      if (isClosed()) return;
      if (activeConnection) {
        return socket.close(CLOSE_CODE_BUSY, "Another browser is connected");
      }

      stage = "ready";
      activeConnection = connection;
      clearTimeout(handshakeTimer);
      unauthenticatedSockets.delete(socket);
      resetIdleTimer();
      sendMessage({ type: "welcome", protocolVersion: PROTOCOL_VERSION });
      options.onConnectionReady(connection);
    }

    socket.on("message", (data: RawData, isBinary: boolean) => {
      if (isBinary) return socket.close(CLOSE_CODE_UNSUPPORTED, "Text only");
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        return socket.close(CLOSE_CODE_UNSUPPORTED, "Not JSON");
      }
      if (!isRecord(parsed)) return;

      if (stage === "ready") {
        resetIdleTimer();
        if (parsed.type === "keepalive") {
          sendMessage({ type: "keepalive-ack" });
        } else if (isResponse(parsed)) {
          options.onResponse(connection, parsed as unknown as BridgeResponse);
        }
        return;
      }

      // Not trusted yet: only the next handshake message is acceptable
      const handshakeStep: Promise<unknown> | undefined =
        stage === "awaitingHello" && parsed.type === "hello"
          ? handleHello(parsed)
          : stage === "awaitingAuth" && parsed.type === "auth"
            ? handleAuth(parsed)
            : undefined;
      if (!handshakeStep) return socket.close(CLOSE_CODE_POLICY, "Unexpected");
      handshakeStep.catch(() => socket.terminate());
    });

    socket.on("close", () => {
      const wasReady = stage === "ready";
      stage = "closed";
      clearTimeout(handshakeTimer);
      if (idleTimer) clearTimeout(idleTimer);
      unauthenticatedSockets.delete(socket);
      if (wasReady) {
        if (activeConnection === connection) activeConnection = null;
        options.onConnectionClosed(connection);
      }
    });
    socket.on("error", () => socket.terminate());
  }

  webSocketServer.on("connection", handleConnection);

  function handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) {
    const isRefused =
      !isAllowedOrigin(request.headers.origin) ||
      unauthenticatedSockets.size >= MAX_UNAUTHENTICATED_SOCKETS;
    if (isRefused) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) =>
      webSocketServer.emit("connection", webSocket, request),
    );
  }

  return {
    start() {
      return new Promise<void>((resolve, reject) => {
        const server = createServer((_request, response) => {
          response.writeHead(426, { "Content-Type": "text/plain" });
          response.end("This is a WebSocket endpoint.");
        });
        server.on("upgrade", handleUpgrade);
        server.once("error", reject);
        server.listen({ host: LOOPBACK_HOST, port: options.port }, () => {
          server.off("error", reject);
          // Late errors (after listening) must not crash the extension host
          server.on("error", () => {});
          httpServer = server;
          resolve();
        });
      });
    },

    stop() {
      webSocketServer.clients.forEach((client) => client.terminate());
      const serverToClose = httpServer;
      httpServer = null;
      if (!serverToClose) return Promise.resolve();
      return new Promise<void>((resolve) =>
        serverToClose.close(() => resolve()),
      );
    },
  };
}
