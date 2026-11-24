import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import { DEFAULT_BRIDGE_PORT, encodePairingCode } from "@protocol";

const SECRET_KEY_TOKEN = "netsuiteTracker.pairingToken";
const TOKEN_BYTES = 24;

/** Keeps the pairing token in VS Code's SecretStorage (OS keychain). */
export interface PairingStore {
  /** The token, or undefined when not paired. */
  getToken(): Promise<string | undefined>;
  getOrCreateToken(): Promise<string>;
  clearToken(): Promise<void>;
}

export function createPairingStore(
  secrets: vscode.SecretStorage,
): PairingStore {
  return {
    getToken() {
      return Promise.resolve(secrets.get(SECRET_KEY_TOKEN));
    },

    async clearToken() {
      await secrets.delete(SECRET_KEY_TOKEN);
    },

    async getOrCreateToken() {
      const existingToken = await secrets.get(SECRET_KEY_TOKEN);
      if (existingToken) return existingToken;
      // base64url is within the protocol's token alphabet (A-Z a-z 0-9 _ -)
      const newToken = randomBytes(TOKEN_BYTES).toString("base64url");
      await secrets.store(SECRET_KEY_TOKEN, newToken);
      return newToken;
    },
  };
}

export function getConfiguredPort(): number {
  return vscode.workspace
    .getConfiguration("netsuiteTracker")
    .get<number>("port", DEFAULT_BRIDGE_PORT);
}

export async function buildPairingCode(
  pairingStore: PairingStore,
): Promise<string> {
  return encodePairingCode({
    port: getConfiguredPort(),
    token: await pairingStore.getOrCreateToken(),
  });
}
