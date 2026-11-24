import * as vscode from "vscode";
import type { BridgeDayKey } from "@protocol";
import { RepositoryError } from "@/data/weekRepository";
import {
  MAX_HOURS_PER_DAY,
  buildDaySummaries,
  findSavedEntry,
  formatHours,
  parseHoursInput,
  roundHours,
  type DaySummary,
} from "@/model/weekModel";
import type { WeekStore } from "@/state/weekStore";
import { todayISO } from "@/utils/dates";
import type { TreeNode } from "@/views/weekTreeProvider";
import { pickOne } from "./pickers";

const OPEN_NETSUITE_ACTION = "Open NetSuite";
const SEPARATOR = " › ";

function showSaveError(error: unknown): void {
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

async function saveWithProgress(
  store: WeekStore,
  params: Parameters<WeekStore["setDayHours"]>[0],
  successMessage: string,
): Promise<void> {
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "NetSuite: saving…" },
      () => store.setDayHours(params),
    );
    vscode.window.setStatusBarMessage(`$(check) ${successMessage}`, 3000);
  } catch (error) {
    showSaveError(error);
  }
}

function resolveReadyDays(store: WeekStore): DaySummary[] | null {
  if (store.viewState !== "ready" || !store.week) {
    void vscode.window.showInformationMessage(
      "Your hours aren't loaded yet — wait for the week view to finish loading.",
    );
    return null;
  }
  return buildDaySummaries(store.week, todayISO());
}

async function pickDay(
  days: DaySummary[],
  targetNode: TreeNode | undefined,
): Promise<DaySummary | undefined> {
  if (targetNode?.kind === "day") return targetNode.day;
  if (targetNode?.kind === "entry") {
    return days.find((day) => day.dayKey === targetNode.entry.dayKey);
  }

  const items = days.map((day) => ({
    label: day.label,
    description: day.totalHours > 0 ? formatHours(day.totalHours) : "",
    detail: day.holidayName ?? undefined,
    day,
  }));
  const todayItem = items.find((item) => item.day.dateISO === todayISO());
  const picked = await pickOne(
    items,
    { placeholder: "Which day?", title: "Log hours" },
    todayItem,
  );
  return picked?.day;
}

/** "Log hours": adds time on top of whatever the day already has for a task. */
export async function logHours(
  store: WeekStore,
  targetNode?: TreeNode,
): Promise<void> {
  const days = resolveReadyDays(store);
  const week = store.week;
  if (!days || !week) return;

  const day = await pickDay(days, targetNode);
  if (!day) return;

  const projectItems = [...week.projects]
    .sort((first, second) => first.name.localeCompare(second.name))
    .map((project) => ({ label: project.name, project }));
  if (projectItems.length === 0) {
    void vscode.window.showInformationMessage(
      "NetSuite has no projects assigned to you for this week.",
    );
    return;
  }
  const pickedProject = await pickOne(projectItems, {
    placeholder: `Project for ${day.label}`,
    title: "Log hours",
  });
  if (!pickedProject) return;

  const tasks = week.tasksByProject[pickedProject.project.id] ?? [];
  if (tasks.length === 0) {
    void vscode.window.showInformationMessage(
      `${pickedProject.project.name} has no tasks assigned to you.`,
    );
    return;
  }
  const task =
    tasks.length === 1
      ? tasks[0]
      : (
          await pickOne(
            tasks.map((candidate) => ({
              label: candidate.name,
              task: candidate,
            })),
            {
              placeholder: `Task in ${pickedProject.project.name}`,
              title: "Log hours",
            },
          )
        )?.task;
  if (!task) return;

  const dayKey: BridgeDayKey = day.dayKey;
  const savedEntry = findSavedEntry(
    week,
    pickedProject.project.id,
    task.id,
    dayKey,
  );
  if (
    savedEntry &&
    (savedEntry.approved || savedEntry.submitted || savedEntry.disabled)
  ) {
    void vscode.window.showWarningMessage(
      `${day.label} is approved, submitted or locked for that task, so it can't be changed.`,
    );
    return;
  }

  const existingHours = savedEntry?.hours ?? 0;
  const taskLabel = `${pickedProject.project.name}${SEPARATOR}${task.name}`;
  const hoursText = await vscode.window.showInputBox({
    title: "Log hours",
    prompt: `Hours to add on ${day.label} — ${taskLabel}${
      existingHours > 0 ? ` (currently ${formatHours(existingHours)})` : ""
    }`,
    placeHolder: "e.g. 1.5 or 1:30",
    validateInput: (text) => {
      const hours = parseHoursInput(text);
      if (hours === null) return "Enter hours like 2, 1.5 or 1:30.";
      if (existingHours + hours > MAX_HOURS_PER_DAY) {
        return `That would exceed ${MAX_HOURS_PER_DAY}h for the day.`;
      }
      return undefined;
    },
  });
  const hoursToAdd =
    hoursText === undefined ? null : parseHoursInput(hoursText);
  if (hoursToAdd === null) return;

  const memo = await vscode.window.showInputBox({
    title: "Log hours",
    prompt: `Memo for ${taskLabel} (optional)`,
    value: savedEntry?.memo ?? "",
  });
  if (memo === undefined) return; // Esc cancels the whole flow

  const newTotal = roundHours(existingHours + hoursToAdd);
  await saveWithProgress(
    store,
    {
      projectId: pickedProject.project.id,
      taskId: task.id,
      dayKey,
      hours: newTotal,
      memo,
    },
    `Logged ${formatHours(hoursToAdd)} on ${day.label} — ${taskLabel}`,
  );
}

/** "Edit hours": sets the exact total for one entry (0 records an explicit zero). */
export async function editHours(
  store: WeekStore,
  targetNode?: TreeNode,
): Promise<void> {
  if (targetNode?.kind !== "entry") return;
  const { entry, dayLabel } = targetNode;
  if (entry.lockReason) {
    void vscode.window.showWarningMessage(
      `${entry.lockReason} entries can't be changed.`,
    );
    return;
  }

  const taskLabel = `${entry.projectName}${SEPARATOR}${entry.taskName}`;
  const hoursText = await vscode.window.showInputBox({
    title: "Edit hours",
    prompt: `Total hours on ${dayLabel} — ${taskLabel}`,
    value: String(entry.entry.hours),
    validateInput: (text) =>
      parseHoursInput(text) === null
        ? "Enter hours like 2, 1.5 or 1:30 (0–24)."
        : undefined,
  });
  const newHours = hoursText === undefined ? null : parseHoursInput(hoursText);
  if (newHours === null) return;

  await saveWithProgress(
    store,
    {
      projectId: entry.projectId,
      taskId: entry.taskId,
      dayKey: entry.dayKey,
      hours: newHours,
    },
    `Set ${dayLabel} — ${taskLabel} to ${formatHours(newHours)}`,
  );
}
