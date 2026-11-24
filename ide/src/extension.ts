import * as vscode from "vscode";
import { registerCommands } from "@/commands";
import { createDisconnectedRepository } from "@/data/disconnectedRepository";
import { createMockWeekRepository } from "@/data/mockWeekRepository";
import type { WeekRepository } from "@/data/weekRepository";
import { createPairingStore } from "@/pairing";
import { WeekStore } from "@/state/weekStore";
import { createStatusBar } from "@/views/statusBar";
import { WEEK_VIEW_ID, WeekWebviewController } from "@/views/weekWebview";

const VIEW_STATE_CONTEXT_KEY = "netsuiteTracker.viewState";

/** Exposed so integration tests can inspect the extension. */
export interface ExtensionApi {
  weekStore: WeekStore;
  weekViewController: WeekWebviewController;
}

export async function activate(
  context: vscode.ExtensionContext,
): Promise<ExtensionApi> {
  const pairingStore = createPairingStore(context.secrets);

  // Launch with NETSUITE_TRACKER_MOCK=1 (the "mock data" launch configuration)
  // to develop the UI without Chrome or NetSuite.
  const isMockMode = process.env.NETSUITE_TRACKER_MOCK === "1";
  let repository: WeekRepository;
  let onPairingChanged: () => Promise<void> = async () => {};
  if (isMockMode) {
    repository = createMockWeekRepository();
  } else {
    const disconnectedRepository =
      await createDisconnectedRepository(pairingStore);
    repository = disconnectedRepository;
    onPairingChanged = () => disconnectedRepository.refreshPairingState();
  }

  const weekStore = new WeekStore(repository);
  const weekViewController = new WeekWebviewController(
    context.extensionUri,
    weekStore,
  );

  const syncContextKey = () => {
    void vscode.commands.executeCommand(
      "setContext",
      VIEW_STATE_CONTEXT_KEY,
      weekStore.viewState,
    );
  };
  syncContextKey();

  registerCommands(context, {
    store: weekStore,
    pairingStore,
    onPairingChanged,
    openInEditor: () => weekViewController.openInEditor(),
  });

  context.subscriptions.push(
    weekStore,
    weekViewController,
    vscode.window.registerWebviewViewProvider(
      WEEK_VIEW_ID,
      weekViewController,
      {
        // Keeps the grid (and any rows being added) alive when the sidebar is hidden
        webviewOptions: { retainContextWhenHidden: true },
      },
    ),
    weekStore.onDidChange(syncContextKey),
    createStatusBar(weekStore),
    // Pick up edits made elsewhere (the web UI) when the window regains focus
    vscode.window.onDidChangeWindowState((windowState) => {
      if (windowState.focused) void weekStore.refreshIfStale();
    }),
  );

  void weekStore.refresh();
  return { weekStore, weekViewController };
}

export function deactivate(): void {}
