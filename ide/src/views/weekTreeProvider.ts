import * as vscode from "vscode";
import {
  WEEKLY_TARGET_HOURS,
  WORKDAY_TARGET_HOURS,
  buildDaySummaries,
  formatHours,
  getTargetProgress,
  getWeekTotalHours,
  renderProgressBar,
  roundHours,
  type DayStatus,
  type DaySummary,
  type EntrySummary,
  type TargetProgress,
} from "@/model/weekModel";
import type { WeekStore } from "@/state/weekStore";
import { todayISO } from "@/utils/dates";

export interface SummaryNode {
  kind: "summary";
}
export interface DayNode {
  kind: "day";
  day: DaySummary;
}
export interface EntryNode {
  kind: "entry";
  entry: EntrySummary;
  dayLabel: string;
}
export type TreeNode = SummaryNode | DayNode | EntryNode;

const SEPARATOR = " › ";

function getDayIcon(status: DayStatus): vscode.ThemeIcon {
  switch (status) {
    case "complete":
      return new vscode.ThemeIcon(
        "check",
        new vscode.ThemeColor("testing.iconPassed"),
      );
    case "missing":
      return new vscode.ThemeIcon(
        "warning",
        new vscode.ThemeColor("problemsWarningIcon.foreground"),
      );
    case "today":
      return new vscode.ThemeIcon(
        "circle-filled",
        new vscode.ThemeColor("charts.blue"),
      );
    case "holiday":
      return new vscode.ThemeIcon("star-empty");
    case "weekend":
      return new vscode.ThemeIcon(
        "circle-small-filled",
        new vscode.ThemeColor("disabledForeground"),
      );
    case "upcoming":
      return new vscode.ThemeIcon("circle-outline");
  }
}

function describeDay(day: DaySummary): string {
  const parts: string[] = [];
  parts.push(day.totalHours > 0 ? formatHours(day.totalHours) : "—");
  const hoursToTarget = roundHours(WORKDAY_TARGET_HOURS - day.totalHours);
  if (day.status === "today" && hoursToTarget > 0) {
    parts.push(`${formatHours(hoursToTarget)} to go`);
  }
  if (day.status === "missing")
    parts.push(`${formatHours(hoursToTarget)} short`);
  if (day.holidayName) parts.push(day.holidayName);
  return parts.join(" · ");
}

function getTargetIcon(progress: TargetProgress): vscode.ThemeIcon {
  switch (progress.state) {
    case "met":
      return new vscode.ThemeIcon(
        "pass",
        new vscode.ThemeColor("testing.iconPassed"),
      );
    case "over":
      return new vscode.ThemeIcon(
        "arrow-up",
        new vscode.ThemeColor("problemsWarningIcon.foreground"),
      );
    case "under":
      return new vscode.ThemeIcon("graph");
  }
}

function describeTarget(progress: TargetProgress): string {
  switch (progress.state) {
    case "met":
      return `Weekly target of ${WEEKLY_TARGET_HOURS}h reached.`;
    case "over":
      return `${formatHours(progress.differenceHours)} over the ${WEEKLY_TARGET_HOURS}h target.`;
    case "under":
      return `${formatHours(progress.differenceHours)} left to reach ${WEEKLY_TARGET_HOURS}h.`;
  }
}

export class WeekTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly changeEmitter = new vscode.EventEmitter<
    TreeNode | undefined
  >();
  private days: DaySummary[] = [];

  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly store: WeekStore) {
    this.rebuild();
    store.onDidChange(() => {
      this.rebuild();
      this.changeEmitter.fire(undefined);
    });
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) {
      if (this.days.length === 0) return []; // lets the welcome view show
      return [
        { kind: "summary" },
        ...this.days.map((day): DayNode => ({ kind: "day", day })),
      ];
    }
    if (element.kind === "day") {
      return element.day.entries.map((entry): EntryNode => ({
        kind: "entry",
        entry,
        dayLabel: element.day.label,
      }));
    }
    return [];
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    switch (node.kind) {
      case "summary":
        return this.buildSummaryItem();
      case "day":
        return this.buildDayItem(node.day);
      case "entry":
        return this.buildEntryItem(node.entry);
    }
  }

  private rebuild(): void {
    const { week, viewState } = this.store;
    this.days =
      week && viewState === "ready" ? buildDaySummaries(week, todayISO()) : [];
  }

  private buildSummaryItem(): vscode.TreeItem {
    const progress = getTargetProgress(getWeekTotalHours(this.days));
    const item = new vscode.TreeItem(
      `${formatHours(progress.totalHours)} of ${WEEKLY_TARGET_HOURS}h`,
      vscode.TreeItemCollapsibleState.None,
    );
    item.id = "summary";
    item.description = `${renderProgressBar(progress.percent)} ${progress.percent}%`;
    item.iconPath = getTargetIcon(progress);
    item.tooltip = describeTarget(progress);
    item.contextValue = "summary";
    return item;
  }

  private buildDayItem(day: DaySummary): vscode.TreeItem {
    const hasEntries = day.entries.length > 0;
    const collapsibleState = !hasEntries
      ? vscode.TreeItemCollapsibleState.None
      : day.dateISO === todayISO()
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;

    const item = new vscode.TreeItem(day.label, collapsibleState);
    item.id = `day-${day.dateISO}`;
    item.description = describeDay(day);
    item.iconPath = getDayIcon(day.status);
    item.contextValue = "day";
    item.tooltip = day.holidayName
      ? `${day.label} — ${day.holidayName}`
      : day.label;
    return item;
  }

  private buildEntryItem(entry: EntrySummary): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `${entry.projectName}${SEPARATOR}${entry.taskName}`,
      vscode.TreeItemCollapsibleState.None,
    );
    const memoPart = entry.entry.memo ? ` · ${entry.entry.memo}` : "";
    item.id = `entry-${entry.rowKey}-${entry.dayKey}`;
    item.description = `${formatHours(entry.entry.hours)}${memoPart}`;
    item.iconPath = new vscode.ThemeIcon(entry.lockReason ? "lock" : "clock");
    item.contextValue = entry.lockReason ? "entry.locked" : "entry.editable";

    const tooltip = new vscode.MarkdownString();
    tooltip.appendText(
      `${entry.projectName}${SEPARATOR}${entry.taskName}\n${formatHours(entry.entry.hours)}`,
    );
    if (entry.entry.memo) tooltip.appendText(`\n${entry.entry.memo}`);
    if (entry.lockReason) {
      tooltip.appendText(`\n${entry.lockReason} — read-only`);
    }
    item.tooltip = tooltip;
    return item;
  }
}
