import * as vscode from "vscode";
import { checkForIdeUpdate } from "./updateCheck";

const STATE_KEY_LAST_CHECK = "netsuiteTracker.lastUpdateCheck";
const STATE_KEY_LAST_NOTIFIED = "netsuiteTracker.lastNotifiedVersion";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DOWNLOAD_ACTION = "Download";

/**
 * Tells the user when a newer release of this extension exists. Automatic
 * checks are quiet (at most once a day, once per version, never offline);
 * a manual check always answers.
 */
export function createUpdateNotifier(context: vscode.ExtensionContext) {
  const currentVersion = String(context.extension.packageJSON.version);

  return async function checkForUpdates(isManual: boolean): Promise<void> {
    const state = context.globalState;
    const now = Date.now();
    if (
      !isManual &&
      now - state.get<number>(STATE_KEY_LAST_CHECK, 0) < CHECK_INTERVAL_MS
    ) {
      return;
    }
    await state.update(STATE_KEY_LAST_CHECK, now);

    const result = await checkForIdeUpdate(currentVersion);
    if (!result) {
      if (isManual) {
        void vscode.window.showInformationMessage(
          "Couldn't check for updates right now.",
        );
      }
      return;
    }
    if (!result.hasUpdate) {
      if (isManual) {
        void vscode.window.showInformationMessage(
          `NetSuite Time v${currentVersion} is up to date.`,
        );
      }
      return;
    }
    const alreadyToldAbout =
      state.get<string>(STATE_KEY_LAST_NOTIFIED) === result.latestVersion;
    if (alreadyToldAbout && !isManual) return;
    await state.update(STATE_KEY_LAST_NOTIFIED, result.latestVersion);

    const chosenAction = await vscode.window.showInformationMessage(
      `NetSuite Time v${result.latestVersion} is available (you have v${currentVersion}).`,
      DOWNLOAD_ACTION,
    );
    if (chosenAction === DOWNLOAD_ACTION) {
      await vscode.env.openExternal(vscode.Uri.parse(result.releaseUrl));
    }
  };
}
