import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import type { BridgeDayKey } from "@protocol";
import { reportOperationError } from "@/commands/errors";
import { DAY_KEYS, MAX_HOURS_PER_DAY } from "@/model/weekModel";
import { buildWeekViewModel, type WeekViewModel } from "@/model/weekViewModel";
import type { WeekStore } from "@/state/weekStore";
import { todayISO } from "@/utils/dates";
import { isRecord } from "@/utils/guards";
import type {
  ExtensionToWebview,
  NavigationTarget,
  WebviewCommand,
  WebviewToExtension,
} from "@/webview/messages";

export const WEEK_VIEW_ID = "netsuiteTracker.week";
const PANEL_VIEW_TYPE = "netsuiteTracker.weekPanel";
const NAVIGATION_TARGETS: readonly NavigationTarget[] = [
  "previous",
  "next",
  "current",
];
const WEBVIEW_COMMANDS: readonly WebviewCommand[] = [
  "pair",
  "openNetSuite",
  "refresh",
  "openSettings",
];
const DELETE_ACTION = "Delete";

function readString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** The webview is our own code, but it is still a separate context: check. */
export function parseWebviewMessage(raw: unknown): WebviewToExtension | null {
  if (!isRecord(raw)) return null;
  switch (raw.type) {
    case "ready":
      return { type: "ready" };
    case "setHours": {
      const cellKey = readString(raw.cellKey);
      const projectId = readString(raw.projectId);
      const taskId = readString(raw.taskId);
      const dayKey = DAY_KEYS.find((candidate) => candidate === raw.dayKey);
      const hours = raw.hours;
      const isValidHours =
        typeof hours === "number" &&
        Number.isFinite(hours) &&
        hours >= 0 &&
        hours <= MAX_HOURS_PER_DAY;
      if (!cellKey || !projectId || !taskId || !dayKey || !isValidHours) {
        return null;
      }
      return {
        type: "setHours",
        cellKey,
        projectId,
        taskId,
        dayKey: dayKey as BridgeDayKey,
        hours,
      };
    }
    case "deleteRow": {
      const rowKey = readString(raw.rowKey);
      return rowKey ? { type: "deleteRow", rowKey } : null;
    }
    case "navigate": {
      const target = NAVIGATION_TARGETS.find(
        (candidate) => candidate === raw.target,
      );
      return target ? { type: "navigate", target } : null;
    }
    case "command": {
      const command = WEBVIEW_COMMANDS.find(
        (candidate) => candidate === raw.command,
      );
      return command ? { type: "command", command } : null;
    }
    default:
      return null;
  }
}

/**
 * Hosts the week grid: in the sidebar (as a webview view) and, on request, in
 * an editor tab. Both show the same model; the webview does all the drawing,
 * this class owns the data and the side effects.
 */
export class WeekWebviewController
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private readonly attachedWebviews = new Set<vscode.Webview>();
  private readonly storeSubscription: vscode.Disposable;
  private sidebarView: vscode.WebviewView | undefined;
  private editorPanel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: WeekStore,
  ) {
    this.storeSubscription = store.onDidChange(() => this.pushModel());
  }

  buildModel(): WeekViewModel {
    return buildWeekViewModel({
      viewState: this.store.viewState,
      errorMessage: this.store.errorMessage,
      week: this.store.week,
      mondayISO: this.store.mondayISO,
      todayISO: todayISO(),
    });
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.sidebarView = view;
    this.attach(view.webview);
    view.onDidDispose(() => {
      this.attachedWebviews.delete(view.webview);
      this.sidebarView = undefined;
    });
    this.updateSidebarTitle();
  }

  openInEditor(): void {
    if (this.editorPanel) {
      this.editorPanel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      "NetSuite Time",
      vscode.ViewColumn.Active,
      { retainContextWhenHidden: true },
    );
    this.editorPanel = panel;
    this.attach(panel.webview);
    panel.onDidDispose(() => {
      this.attachedWebviews.delete(panel.webview);
      this.editorPanel = undefined;
    });
  }

  /** Handles one message from a webview. Public so tests can drive it. */
  async handleMessage(
    rawMessage: unknown,
    sourceWebview?: vscode.Webview,
  ): Promise<void> {
    const message = parseWebviewMessage(rawMessage);
    if (!message) return;

    switch (message.type) {
      case "ready":
        if (sourceWebview) this.postTo(sourceWebview, this.renderMessage());
        else this.pushModel();
        return;
      case "setHours":
        await this.saveHours(message);
        return;
      case "deleteRow":
        await this.deleteRow(message.rowKey);
        return;
      case "navigate":
        if (message.target === "current") await this.store.goToCurrentWeek();
        else {
          await this.store.goToRelativeWeek(message.target === "next" ? 1 : -1);
        }
        return;
      case "command":
        if (message.command === "openSettings") {
          await vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "netsuiteTracker.port",
          );
        } else {
          await vscode.commands.executeCommand(
            `netsuiteTracker.${message.command}`,
          );
        }
        return;
    }
  }

  dispose(): void {
    this.storeSubscription.dispose();
    this.editorPanel?.dispose();
  }

  /**
   * Asks the user to confirm removing a row. A member rather than inline code
   * so tests can answer it — VS Code refuses modal dialogs in unattended runs.
   */
  confirmRowDeletion = async (rowLabel: string): Promise<boolean> => {
    const chosenAction = await vscode.window.showWarningMessage(
      `Remove "${rowLabel}"?`,
      {
        modal: true,
        detail: "This deletes all saved time entries in this row.",
      },
      DELETE_ACTION,
    );
    return chosenAction === DELETE_ACTION;
  };

  private async saveHours(
    message: Extract<WebviewToExtension, { type: "setHours" }>,
  ): Promise<void> {
    let wasSuccessful = true;
    try {
      await this.store.setDayHours({
        projectId: message.projectId,
        taskId: message.taskId,
        dayKey: message.dayKey,
        hours: message.hours,
      });
    } catch (error) {
      wasSuccessful = false;
      reportOperationError(error);
    }
    this.postToAll({
      type: "saved",
      cellKey: message.cellKey,
      wasSuccessful,
    });
  }

  private async deleteRow(rowKey: string): Promise<void> {
    const row = this.store.week?.rows.find(
      (candidate) => candidate.rowKey === rowKey,
    );
    if (!row) return;
    const timeids = DAY_KEYS.map(
      (dayKey) => row.days[dayKey]?.timeid ?? "",
    ).filter((timeid) => timeid !== "");
    if (timeids.length === 0) return;

    const rowLabel = `${row.projectName} — ${row.taskName}`;
    if (!(await this.confirmRowDeletion(rowLabel))) return;

    try {
      await this.store.deleteRow(timeids);
    } catch (error) {
      reportOperationError(error);
    }
  }

  private attach(webview: vscode.Webview): void {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist"),
        vscode.Uri.joinPath(this.extensionUri, "media"),
      ],
    };
    webview.html = this.buildHtml(webview);
    webview.onDidReceiveMessage((message: unknown) =>
      this.handleMessage(message, webview),
    );
    this.attachedWebviews.add(webview);
  }

  private renderMessage(): ExtensionToWebview {
    return { type: "render", model: this.buildModel() };
  }

  private pushModel(): void {
    this.updateSidebarTitle();
    this.postToAll(this.renderMessage());
  }

  private updateSidebarTitle(): void {
    if (this.sidebarView) {
      this.sidebarView.title = this.store.isCurrentWeek ? "This Week" : "Week";
    }
  }

  private postToAll(message: ExtensionToWebview): void {
    this.attachedWebviews.forEach((webview) => this.postTo(webview, message));
  }

  private postTo(webview: vscode.Webview, message: ExtensionToWebview): void {
    void webview.postMessage(message);
  }

  private buildHtml(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString("hex");
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "week.css"),
    );
    // No inline styles or scripts: the CSS and script are external files and
    // only the script carrying this nonce may run.
    const contentSecurityPolicy = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>NetSuite Time</title>
</head>
<body>
  <div id="app" class="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
