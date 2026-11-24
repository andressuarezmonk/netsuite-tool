import * as vscode from "vscode";
import { RepositoryError } from "@/data/weekRepository";

const OPEN_NETSUITE_ACTION = "Open NetSuite";

/** Tells the user why a save or delete failed, with a way out when there is one. */
export function reportOperationError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const isSessionExpired =
    error instanceof RepositoryError && error.code === "SESSION_EXPIRED";
  if (isSessionExpired) {
    void vscode.window
      .showErrorMessage(message, OPEN_NETSUITE_ACTION)
      .then((chosenAction) => {
        if (chosenAction === OPEN_NETSUITE_ACTION) {
          void vscode.commands.executeCommand("netsuiteTracker.openNetSuite");
        }
      });
    return;
  }
  void vscode.window.showErrorMessage(`Couldn't save: ${message}`);
}
