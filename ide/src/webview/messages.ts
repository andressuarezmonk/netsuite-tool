// Messages between the extension host and the week webview. Types only, so
// both bundles can import it without pulling in the other's runtime.

import type { BridgeDayKey } from "@protocol";
import type { WeekViewModel } from "@/model/weekViewModel";

export type ExtensionToWebview =
  | { type: "render"; model: WeekViewModel }
  /** A save finished; the cell can stop showing the typed value. */
  | { type: "saved"; cellKey: string; wasSuccessful: boolean };

export type NavigationTarget = "previous" | "next" | "current";
export type WebviewCommand =
  | "pair"
  | "openNetSuite"
  | "refresh"
  | "openSettings"
  | "openWebReleases"
  | "openIdeReleases";

export type WebviewToExtension =
  | { type: "ready" }
  | {
      type: "setHours";
      cellKey: string;
      projectId: string;
      taskId: string;
      dayKey: BridgeDayKey;
      hours: number;
    }
  | { type: "deleteRow"; rowKey: string }
  | { type: "navigate"; target: NavigationTarget }
  | { type: "command"; command: WebviewCommand };

export function buildCellKey(
  projectId: string,
  taskId: string,
  dayKey: BridgeDayKey,
): string {
  return `${projectId}|${taskId}|${dayKey}`;
}
