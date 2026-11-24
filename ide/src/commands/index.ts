import * as vscode from "vscode";
import type { PairingStore } from "@/pairing";
import { buildPairingCode } from "@/pairing";
import type { WeekStore } from "@/state/weekStore";
import { IDE_RELEASES_URL, WEB_RELEASES_URL } from "@/constants";
import { logHours } from "./hoursCommands";

const RESET_ACTION = "Reset";

interface CommandDependencies {
  store: WeekStore;
  pairingStore: PairingStore;
  /** Called after a pairing code is created so the UI moves on from "not paired". */
  onPairingChanged: () => Promise<void>;
  openInEditor: () => void;
  /** Looks for a newer release of this extension; manual checks report even "up to date". */
  checkForUpdates: (isManual: boolean) => Promise<void>;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  {
    store,
    pairingStore,
    onPairingChanged,
    openInEditor,
    checkForUpdates,
  }: CommandDependencies,
): void {
  const register = (
    commandId: string,
    handler: (...args: never[]) => unknown,
  ) =>
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, handler),
    );

  register("netsuiteTracker.refresh", () => store.refresh());
  register("netsuiteTracker.previousWeek", () => store.goToRelativeWeek(-1));
  register("netsuiteTracker.nextWeek", () => store.goToRelativeWeek(1));
  register("netsuiteTracker.currentWeek", () => store.goToCurrentWeek());

  register("netsuiteTracker.logHours", () => logHours(store));
  register("netsuiteTracker.openInEditor", () => openInEditor());

  register("netsuiteTracker.pair", async () => {
    const pairingCode = await buildPairingCode(pairingStore);
    await vscode.env.clipboard.writeText(pairingCode);
    await onPairingChanged();
    void vscode.window.showInformationMessage(
      "Pairing code copied. Paste it into the NetSuite Fast Time Tracker popup in Chrome (VS Code section).",
    );
  });

  register("netsuiteTracker.resetPairing", async () => {
    const chosenAction = await vscode.window.showWarningMessage(
      "Reset pairing?",
      {
        modal: true,
        detail:
          "Chrome will be disconnected and you'll need to pair again with a new code.",
      },
      RESET_ACTION,
    );
    if (chosenAction !== RESET_ACTION) return;
    await pairingStore.clearToken();
    await onPairingChanged();
  });

  register("netsuiteTracker.openWebReleases", () =>
    vscode.env.openExternal(vscode.Uri.parse(WEB_RELEASES_URL)),
  );
  register("netsuiteTracker.openIdeReleases", () =>
    vscode.env.openExternal(vscode.Uri.parse(IDE_RELEASES_URL)),
  );
  register("netsuiteTracker.checkForUpdates", () => checkForUpdates(true));

  register("netsuiteTracker.openNetSuite", async () => {
    const accountOrigin = store.accountOrigin;
    if (!accountOrigin) {
      void vscode.window.showInformationMessage(
        "Open your NetSuite time entry page in Chrome once, so the account is known.",
      );
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(accountOrigin));
  });
}
