import * as vscode from "vscode";
import type { PairingStore } from "@/pairing";
import { buildPairingCode } from "@/pairing";
import type { WeekStore } from "@/state/weekStore";
import type { TreeNode } from "@/views/weekTreeProvider";
import { editHours, logHours } from "./hoursCommands";

interface CommandDependencies {
  store: WeekStore;
  pairingStore: PairingStore;
  /** Called after a pairing code is created so the UI moves on from "not paired". */
  onPairingChanged: () => Promise<void>;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  { store, pairingStore, onPairingChanged }: CommandDependencies,
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

  register("netsuiteTracker.logHours", (node?: TreeNode) =>
    logHours(store, node),
  );
  register("netsuiteTracker.editHours", (node?: TreeNode) =>
    editHours(store, node),
  );

  register("netsuiteTracker.pair", async () => {
    const pairingCode = await buildPairingCode(pairingStore);
    await vscode.env.clipboard.writeText(pairingCode);
    await onPairingChanged();
    void vscode.window.showInformationMessage(
      "Pairing code copied. Paste it into the NetSuite Fast Time Tracker popup in Chrome (VS Code section).",
    );
  });

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
