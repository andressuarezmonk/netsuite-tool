// The real repository will talk to Chrome over the bridge. Until the server
// side exists, this reports "notPaired"/"waiting" honestly and fails every
// request, so the UI shows the right guidance instead of fake data.

import * as vscode from "vscode";
import type { PairingStore } from "@/pairing";
import {
  RepositoryError,
  type RepositoryStatus,
  type WeekRepository,
} from "./weekRepository";

export interface DisconnectedRepository extends WeekRepository {
  /** Re-reads whether a pairing token exists and fires a status change. */
  refreshPairingState(): Promise<void>;
}

export async function createDisconnectedRepository(
  pairingStore: PairingStore,
): Promise<DisconnectedRepository> {
  const statusEmitter = new vscode.EventEmitter<RepositoryStatus>();
  let status: RepositoryStatus = (await pairingStore.hasToken())
    ? "waiting"
    : "notPaired";

  const notConnected = () =>
    Promise.reject(
      new RepositoryError("NOT_CONNECTED", "Chrome is not connected."),
    );

  return {
    get status() {
      return status;
    },
    onDidChangeStatus: statusEmitter.event,
    accountOrigin: null,
    getWeek: notConnected,
    setDayHours: notConnected,
    deleteRow: notConnected,

    async refreshPairingState() {
      const nextStatus: RepositoryStatus = (await pairingStore.hasToken())
        ? "waiting"
        : "notPaired";
      if (nextStatus === status) return;
      status = nextStatus;
      statusEmitter.fire(status);
    },
  };
}
