import * as vscode from "vscode";
import { registerCommands } from "@/commands";
import { createDisconnectedRepository } from "@/data/disconnectedRepository";
import { createMockWeekRepository } from "@/data/mockWeekRepository";
import type { WeekRepository } from "@/data/weekRepository";
import { createPairingStore } from "@/pairing";
import { WeekStore, type ViewState } from "@/state/weekStore";
import { formatWeekRange } from "@/utils/dates";
import { createStatusBar } from "@/views/statusBar";
import { WeekTreeProvider } from "@/views/weekTreeProvider";

const VIEW_ID = "netsuiteTracker.week";
const VIEW_STATE_CONTEXT_KEY = "netsuiteTracker.viewState";

/** Exposed so integration tests can inspect the extension. */
export interface ExtensionApi {
  weekStore: WeekStore;
  weekTreeProvider: WeekTreeProvider;
}

const STATES_THAT_SHOW_A_WEEK: readonly ViewState[] = ["ready", "loading"];

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
  const weekTreeProvider = new WeekTreeProvider(weekStore);
  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: weekTreeProvider,
  });

  const syncViewChrome = () => {
    void vscode.commands.executeCommand(
      "setContext",
      VIEW_STATE_CONTEXT_KEY,
      weekStore.viewState,
    );
    treeView.title = weekStore.isCurrentWeek ? "This Week" : "Week";
    treeView.description = STATES_THAT_SHOW_A_WEEK.includes(weekStore.viewState)
      ? formatWeekRange(weekStore.mondayISO)
      : undefined;
    treeView.message =
      weekStore.viewState === "loading"
        ? "Loading…"
        : weekStore.viewState === "error"
          ? weekStore.errorMessage
          : undefined;
  };
  syncViewChrome();

  registerCommands(context, {
    store: weekStore,
    pairingStore,
    onPairingChanged,
  });

  context.subscriptions.push(
    weekStore,
    treeView,
    weekStore.onDidChange(syncViewChrome),
    createStatusBar(weekStore),
    // Pick up edits made elsewhere (the web UI) when the window regains focus
    vscode.window.onDidChangeWindowState((windowState) => {
      if (windowState.focused) void weekStore.refreshIfStale();
    }),
  );

  void weekStore.refresh();
  return { weekStore, weekTreeProvider };
}

export function deactivate(): void {}
