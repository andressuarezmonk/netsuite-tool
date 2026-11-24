// Wire protocol between the Chrome extension (web/) and the VS Code extension
// (ide/), spoken over a WebSocket on 127.0.0.1.
//
// This file is the single source of truth for both sides and must stay
// dependency-free: no imports, no `window`, no `chrome`, no `vscode`. It is
// compiled into each package separately — neither package ships the other.
//
// Connection flow — mutual authentication. The pairing token is NEVER sent;
// each side proves it knows it with an HMAC, so a program that merely squats
// on the port can neither learn the token nor command the browser:
//   1. Chrome connects and sends `hello` with a random clientNonce.
//   2. The server answers `challenge`: its own serverNonce plus a serverProof
//      that only someone who knows the token can compute. Chrome verifies it
//      first. If it fails Chrome hangs up — it has sent nothing secret and
//      acts on nothing.
//   3. Chrome sends `auth` with its clientProof; the server verifies it and
//      closes with CLOSE_CODE_UNAUTHORIZED if it is wrong.
//   4. The server sends `welcome`. Only now does Chrome act on requests.
//   5. VS Code sends `BridgeRequestEnvelope`s; Chrome answers each with a
//      `BridgeResponse` carrying the same id. Chrome sends `keepalive` every
//      ~20s (keeps the MV3 service worker alive); the server answers
//      `keepalive-ack`.

export const PROTOCOL_VERSION = 1;
export const DEFAULT_BRIDGE_PORT = 8765;
export const KEEPALIVE_INTERVAL_MS = 20_000;

export const CLOSE_CODE_UNAUTHORIZED = 4001; // server -> chrome: bad clientProof
export const CLOSE_CODE_INCOMPATIBLE = 4002; // either side: protocol mismatch
export const CLOSE_CODE_SERVER_NOT_VERIFIED = 4003; // chrome -> server: bad serverProof

// ── Pairing ──────────────────────────────────────────────────────────────────
// The user copies a single pairing code from VS Code and pastes it into the
// Chrome extension popup. Format: "nsft1.<port>.<token>".

const PAIRING_CODE_PREFIX = "nsft1";
const PAIRING_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export interface PairingInfo {
  port: number;
  token: string;
}

export function encodePairingCode(pairingInfo: PairingInfo): string {
  return `${PAIRING_CODE_PREFIX}.${pairingInfo.port}.${pairingInfo.token}`;
}

export function parsePairingCode(text: string): PairingInfo | null {
  const [prefix, portText, token, ...rest] = text.trim().split(".");
  if (prefix !== PAIRING_CODE_PREFIX || rest.length > 0) return null;
  const port = Number(portText);
  const isValidPort = Number.isInteger(port) && port >= 1024 && port <= 65535;
  if (!isValidPort || !token || !PAIRING_TOKEN_PATTERN.test(token)) return null;
  return { port, token };
}

// ── Handshake and keepalive ──────────────────────────────────────────────────

export interface HelloMessage {
  type: "hello";
  protocolVersion: number;
  extensionVersion: string;
  clientNonce: string;
}

export interface ChallengeMessage {
  type: "challenge";
  protocolVersion: number;
  serverNonce: string;
  serverProof: string;
}

export interface AuthMessage {
  type: "auth";
  clientProof: string;
}

export interface WelcomeMessage {
  type: "welcome";
  protocolVersion: number;
}

export interface KeepaliveMessage {
  type: "keepalive";
}

export interface KeepaliveAckMessage {
  type: "keepalive-ack";
}

// ── Proofs ───────────────────────────────────────────────────────────────────
// HMAC-SHA256 keyed with the pairing token. Uses the Web Crypto API, which is
// a global in both the browser/service worker and Node. The role label stops a
// proof from one direction being replayed as the other.

export type ProofRole = "server" | "client";

const NONCE_BYTES = 16;
const PROOF_PATTERN = /^[0-9a-f]{64}$/;
const textEncoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function generateNonce(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));
}

async function importProofKey(token: string) {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function buildProofInput(
  role: ProofRole,
  protocolVersion: number,
  clientNonce: string,
  serverNonce: string,
) {
  return textEncoder.encode(
    `nsft-proof|${role}|${protocolVersion}|${clientNonce}|${serverNonce}`,
  );
}

export async function computeProof(
  token: string,
  role: ProofRole,
  protocolVersion: number,
  clientNonce: string,
  serverNonce: string,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importProofKey(token),
    buildProofInput(role, protocolVersion, clientNonce, serverNonce),
  );
  return toHex(new Uint8Array(signature));
}

/** Constant-time check of a proof received from the other side. */
export async function verifyProof(
  token: string,
  role: ProofRole,
  protocolVersion: number,
  clientNonce: string,
  serverNonce: string,
  proof: unknown,
): Promise<boolean> {
  if (typeof proof !== "string" || !PROOF_PATTERN.test(proof)) return false;
  const proofBytes = new Uint8Array(
    (proof.match(/../g) ?? []).map((hexPair) => parseInt(hexPair, 16)),
  );
  return crypto.subtle.verify(
    "HMAC",
    await importProofKey(token),
    proofBytes,
    buildProofInput(role, protocolVersion, clientNonce, serverNonce),
  );
}

// ── Errors ───────────────────────────────────────────────────────────────────

export type BridgeErrorCode =
  | "SESSION_EXPIRED" // NetSuite session is gone — user must log in again
  | "NOT_CONFIGURED" // the extension has never seen a NetSuite page
  | "NETWORK" // could not reach NetSuite
  | "NS_ERROR" // NetSuite reached, but refused or failed the operation
  | "BAD_REQUEST"; // invalid parameters, or the cell/row is locked

export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
}

// ── Domain types on the wire ─────────────────────────────────────────────────

export type BridgeDayKey =
  "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface WireDayEntry {
  hours: number;
  memo: string;
  timeid: string; // "" when the cell has never been saved
  approved: boolean;
  submitted: boolean;
  disabled: boolean;
}

export interface WireNamedItem {
  id: string;
  name: string;
}

export interface WireRow {
  rowKey: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
  days: Partial<Record<BridgeDayKey, WireDayEntry>>;
}

export interface WeekResult {
  mondayISO: string; // "YYYY-MM-DD"
  userId: string;
  rows: WireRow[];
  holidays: Partial<Record<BridgeDayKey, string>>;
  projects: WireNamedItem[];
  tasksByProject: Record<string, WireNamedItem[]>;
}

// ── Requests (VS Code → Chrome) ──────────────────────────────────────────────

type Empty = Record<string, never>;

export interface StatusResult {
  protocolVersion: number;
  extensionVersion: string;
  /** NetSuite account the extension is using, or null if it has none yet. */
  accountOrigin: string | null;
}

export interface SetDayHoursParams {
  mondayISO: string;
  projectId: string;
  taskId: string;
  dayKey: BridgeDayKey;
  /** The new total for the day (not an increment). 0 records an explicit zero. */
  hours: number;
  /** Omit to keep the existing memo. */
  memo?: string;
}

export interface DeleteRowParams {
  mondayISO: string;
  timeids: string[];
}

export interface BridgeRequestMap {
  getStatus: { params: Empty; result: StatusResult };
  getWeek: { params: { mondayISO: string }; result: WeekResult };
  setDayHours: { params: SetDayHoursParams; result: WeekResult };
  deleteRow: { params: DeleteRowParams; result: WeekResult };
}

export type BridgeRequestType = keyof BridgeRequestMap;

export const BRIDGE_REQUEST_TYPES: readonly BridgeRequestType[] = [
  "getStatus",
  "getWeek",
  "setDayHours",
  "deleteRow",
];

export type BridgeRequestEnvelope = {
  [Type in BridgeRequestType]: {
    id: string;
    type: Type;
    params: BridgeRequestMap[Type]["params"];
  };
}[BridgeRequestType];

export type BridgeResponse =
  | { id: string; ok: true; data: unknown }
  | { id: string; ok: false; error: BridgeError };

// ── Everything that can travel over the socket ───────────────────────────────

/** Messages the VS Code side sends. */
export type ServerMessage =
  | ChallengeMessage
  | WelcomeMessage
  | KeepaliveAckMessage
  | BridgeRequestEnvelope;

/** Messages the Chrome side sends. */
export type ClientMessage =
  HelloMessage | AuthMessage | KeepaliveMessage | BridgeResponse;
