// Runs inside the webview (a browser context): draws the week grid from the
// view model the extension host posts, and reports what the user does.
// No `vscode` import — that module only exists in the extension host.

import type { BridgeDayKey } from "@protocol";
import { parseHoursInput } from "@/model/weekModel";
import {
  formatPlainHours,
  type CellModel,
  type DayColumn,
  type NamedItem,
  type RowModel,
  type WeekViewModel,
} from "@/model/weekViewModel";
import {
  buildCellKey,
  type ExtensionToWebview,
  type NavigationTarget,
  type WebviewCommand,
  type WebviewToExtension,
} from "./messages";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToExtension): void;
};

const vscodeApi = acquireVsCodeApi();
const appElement = document.getElementById("app");
if (!appElement) throw new Error("The #app element is missing.");
const app: HTMLElement = appElement;

// ── State that only exists in the webview ────────────────────────────────────

/** A row the user added but hasn't entered any hours in yet. */
interface DraftRow {
  rowKey: string;
  projectId: string;
  taskId: string;
  projectName: string;
  taskName: string;
}

/** A row to draw: either one from the server or a draft. */
interface GridRow {
  rowKey: string;
  projectId: string;
  taskId: string;
  projectName: string;
  taskName: string;
  cells: RowModel["cells"];
  totalHours: number;
  hasApprovedEntry: boolean;
  isDraft: boolean;
}

interface FocusSnapshot {
  cellKey: string;
  typedValue: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

let model: WeekViewModel | null = null;
let draftRows: DraftRow[] = [];
let draftsBelongToWeek = "";
let selectedProjectId = "";
let selectedTaskId = "";
// What the user typed into cells whose save hasn't finished yet
const pendingValues = new Map<string, string>();

// ── Helpers ──────────────────────────────────────────────────────────────────

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

function send(message: WebviewToExtension): void {
  vscodeApi.postMessage(message);
}

function classNames(
  ...names: Array<string | false | null | undefined>
): string {
  return names.filter(Boolean).join(" ");
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderMessageCard(
  title: string,
  text: string,
  buttons: Array<{ label: string; command: WebviewCommand }> = [],
): string {
  const buttonsHtml = buttons
    .map(
      (button, buttonIndex) =>
        `<button class="${buttonIndex === 0 ? "primary" : "secondary"}" data-action="command" data-command="${button.command}">${escapeHtml(button.label)}</button>`,
    )
    .join("");
  return `<div class="state-card">
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(text)}</p>
    <div class="state-buttons">${buttonsHtml}</div>
  </div>`;
}

function renderNotReady(current: WeekViewModel | null): string {
  switch (current?.state) {
    case undefined:
    case "loading":
      return `<div class="state-card"><p class="loading">Loading…</p></div>`;
    case "notPaired":
      return renderMessageCard(
        "Connect to Chrome",
        "Pair this extension with the NetSuite Fast Time Tracker Chrome extension to see and log your hours here. Then paste the copied code into the Chrome extension's popup.",
        [{ label: "Pair with Chrome", command: "pair" }],
      );
    case "waiting":
      return renderMessageCard(
        "Waiting for Chrome…",
        "Make sure Chrome is open and the NetSuite Fast Time Tracker extension is paired.",
        [
          { label: "Retry", command: "refresh" },
          { label: "Copy pairing code", command: "pair" },
        ],
      );
    case "portInUse":
      return renderMessageCard(
        "Port already in use",
        "Chrome connects to a local port, and something else is using it — often another VS Code window (only one can be connected at a time). Close the other one, or choose a different port in settings and pair again.",
        [
          { label: "Retry", command: "refresh" },
          { label: "Open settings", command: "openSettings" },
        ],
      );
    case "sessionExpired":
      return renderMessageCard(
        "NetSuite session expired",
        "Log in to NetSuite again in your browser, then retry.",
        [
          { label: "Open NetSuite", command: "openNetSuite" },
          { label: "Retry", command: "refresh" },
        ],
      );
    case "notConfigured":
      return renderMessageCard(
        "NetSuite account unknown",
        "Open your NetSuite time entry page in Chrome once, then retry.",
        [{ label: "Retry", command: "refresh" }],
      );
    case "error":
    default:
      return renderMessageCard(
        "Couldn't load your hours",
        current?.errorMessage || "Something went wrong.",
        [{ label: "Retry", command: "refresh" }],
      );
  }
}

function renderNav(current: WeekViewModel): string {
  const button = (target: NavigationTarget, label: string, title: string) =>
    `<button class="secondary" data-action="navigate" data-target="${target}" title="${title}">${label}</button>`;
  return `<div class="nav">
    ${button("previous", "◀", "Previous week")}
    <span class="range">${escapeHtml(current.rangeLabel)}</span>
    ${button("next", "▶", "Next week")}
    ${current.isCurrentWeek ? "" : button("current", "This week", "Go to the current week")}
  </div>`;
}

function renderProgress(current: WeekViewModel): string {
  const { progress } = current;
  const holidayNote =
    progress.weekdayHolidayCount > 0
      ? `<span class="holiday-note" title="Holidays still count toward the target — log them under Out of Office">${progress.weekdayHolidayCount} holiday${progress.weekdayHolidayCount > 1 ? "s" : ""}</span>`
      : "";
  const savingNote =
    pendingValues.size > 0
      ? `<span class="saving-note" role="status">Saving…</span>`
      : "";
  return `<div class="progress">
    <div class="progress-summary">
      <span class="hours">${formatPlainHours(progress.totalHours)} / ${formatPlainHours(progress.targetHours)}h</span>
      <span class="remaining ${progress.state}">${escapeHtml(progress.label)}</span>
      ${holidayNote}${savingNote}
    </div>
    <div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}" aria-label="Weekly hours progress">
      <div class="bar ${progress.state}" data-percent="${progress.percent}"></div>
    </div>
  </div>`;
}

function columnClasses(day: DayColumn, dayIndex: number): string {
  return classNames(
    `d${dayIndex}`,
    day.isToday && "today",
    day.isWeekend && "weekend",
    day.holidayName !== null && "holiday",
  );
}

function renderHeaderRow(days: DayColumn[]): string {
  const dayHeads = days
    .map(
      (day, dayIndex) =>
        `<div class="day-head ${columnClasses(day, dayIndex)}" ${day.holidayName ? `title="${escapeHtml(day.holidayName)}"` : ""}>
          <span class="weekday">${day.weekdayLabel}</span>
          <span class="date">${day.dateLabel}</span>
          ${day.holidayName ? `<span class="holiday-name">${escapeHtml(day.holidayName)}</span>` : ""}
        </div>`,
    )
    .join("");
  return `<div class="row head" role="row">
    <div class="name">Project / Task</div>${dayHeads}<div class="total">Total</div><div class="del"></div>
  </div>`;
}

function describeCellTitle(cell: CellModel | undefined): string {
  if (!cell) return "";
  const statusText: Record<CellModel["status"], string> = {
    editable: "",
    approved: "Approved — cannot edit",
    submitted: "Submitted — pending approval",
    locked: "Locked — cannot edit",
  };
  return [statusText[cell.status], cell.memo].filter(Boolean).join("\n");
}

function renderCell(row: GridRow, day: DayColumn, dayIndex: number): string {
  const cell = row.cells[day.dayKey];
  const cellKey = buildCellKey(row.projectId, row.taskId, day.dayKey);
  const pendingValue = pendingValues.get(cellKey);
  const isSaving = pendingValue !== undefined;
  const serverValue = cell ? formatPlainHours(cell.hours) : "";
  const isReadOnly = cell !== undefined && cell.status !== "editable";
  const inputClasses = classNames(
    "hours-input",
    cell && cell.status !== "editable" && cell.status,
    cell && !isReadOnly && "has-value",
    isSaving && "saving",
  );
  const label = `${row.projectName}, ${row.taskName}, ${day.weekdayLabel} ${day.dateLabel}`;
  const title = describeCellTitle(cell);
  return `<div class="day ${columnClasses(day, dayIndex)}">
    <input type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
      class="${inputClasses}" value="${escapeHtml(pendingValue ?? serverValue)}"
      data-cell-key="${escapeHtml(cellKey)}" data-project="${escapeHtml(row.projectId)}" data-task="${escapeHtml(row.taskId)}"
      data-day="${day.dayKey}" data-original="${escapeHtml(serverValue)}"
      aria-label="${escapeHtml(label)} (hours)" ${title ? `title="${escapeHtml(title)}"` : ""}
      ${isReadOnly ? "readonly" : ""} />
  </div>`;
}

function renderDataRow(row: GridRow, days: DayColumn[]): string {
  const hasEntry = Object.keys(row.cells).length > 0;
  const deleteButton = row.isDraft
    ? `<button class="icon-button" data-action="remove-draft" data-row="${escapeHtml(row.rowKey)}" title="Remove this row" aria-label="Remove this row">×</button>`
    : `<button class="icon-button" data-action="delete-row" data-row="${escapeHtml(row.rowKey)}"
        ${row.hasApprovedEntry ? "disabled" : ""}
        title="${row.hasApprovedEntry ? "Cannot delete — row has approved entries" : "Remove this row"}"
        aria-label="Remove this row">×</button>`;
  return `<div class="row ${row.isDraft ? "draft" : ""}" role="row" data-row-key="${escapeHtml(row.rowKey)}">
    <div class="name" title="${escapeHtml(`${row.projectName} › ${row.taskName}`)}">
      <span class="project">${escapeHtml(row.projectName)}</span>
      <span class="task">${escapeHtml(row.taskName || "—")}</span>
    </div>
    ${days.map((day, dayIndex) => renderCell(row, day, dayIndex)).join("")}
    <div class="total">${hasEntry ? formatPlainHours(row.totalHours) : ""}</div>
    <div class="del">${deleteButton}</div>
  </div>`;
}

function renderTotalsRow(current: WeekViewModel): string {
  const dayTotals = current.days
    .map((day, dayIndex) => {
      const tooltip = day.targetStatus
        ? `${day.targetStatus === "under" ? "Under" : "Over"} the daily target`
        : "";
      return `<div class="day-total ${columnClasses(day, dayIndex)} ${day.targetStatus ?? ""}" ${tooltip ? `title="${tooltip}"` : ""}>
        ${day.showsTotal ? formatPlainHours(day.totalHours) : ""}
      </div>`;
    })
    .join("");
  const hasAnyEntry = current.rows.length > 0;
  return `<div class="row totals" role="row">
    <div class="name">Week total</div>${dayTotals}
    <div class="total">${hasAnyEntry ? formatPlainHours(current.progress.totalHours) : ""}</div><div class="del"></div>
  </div>`;
}

function collectGridRows(current: WeekViewModel): GridRow[] {
  const serverRows: GridRow[] = current.rows.map((row) => ({
    ...row,
    isDraft: false,
  }));
  const draftGridRows: GridRow[] = draftRows.map((draft) => ({
    ...draft,
    cells: {},
    totalHours: 0,
    hasApprovedEntry: false,
    isDraft: true,
  }));
  return [...serverRows, ...draftGridRows];
}

function renderOptions(
  items: NamedItem[],
  selectedId: string,
  placeholder: string,
): string {
  const options = items
    .map(
      (item) =>
        `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(item.name)}</option>`,
    )
    .join("");
  return `<option value="">${placeholder}</option>${options}`;
}

function renderAddBar(current: WeekViewModel): string {
  const tasks = current.tasksByProject[selectedProjectId] ?? [];
  const canAdd = selectedProjectId !== "" && selectedTaskId !== "";
  return `<div class="add-bar">
    <select data-role="project" aria-label="Project">${renderOptions(current.projects, selectedProjectId, "— Select project —")}</select>
    <select data-role="task" aria-label="Task" ${selectedProjectId === "" ? "disabled" : ""}>${renderOptions(tasks, selectedTaskId, "— Select task —")}</select>
    <button class="primary" data-action="add-row" ${canAdd ? "" : "disabled"}>+ Add row</button>
  </div>`;
}

function renderReady(current: WeekViewModel): string {
  const rows = collectGridRows(current);
  const rowsHtml =
    rows.length === 0
      ? `<div class="empty">No entries this week. Add a row below.</div>`
      : rows.map((row) => renderDataRow(row, current.days)).join("");
  return `${renderNav(current)}${renderProgress(current)}
    <div class="grid" role="table" aria-label="Week ${escapeHtml(current.rangeLabel)}">
      ${renderHeaderRow(current.days)}${rowsHtml}${renderTotalsRow(current)}
    </div>
    ${renderAddBar(current)}`;
}

function captureFocus(): FocusSnapshot | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement) || !active.dataset.cellKey) {
    return null;
  }
  return {
    cellKey: active.dataset.cellKey,
    typedValue: active.value,
    selectionStart: active.selectionStart,
    selectionEnd: active.selectionEnd,
  };
}

function restoreFocus(snapshot: FocusSnapshot | null): void {
  if (!snapshot) return;
  const input = Array.from(
    app.querySelectorAll<HTMLInputElement>("input[data-cell-key]"),
  ).find((candidate) => candidate.dataset.cellKey === snapshot.cellKey);
  if (!input || input.readOnly) return;
  input.value = snapshot.typedValue; // keep what the user was typing
  input.focus();
  input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
}

function render(): void {
  const focusSnapshot = captureFocus();
  app.innerHTML =
    model?.state === "ready" ? renderReady(model) : renderNotReady(model);
  // Inline style attributes are blocked by the webview's CSP; setting the
  // width through the CSSOM is allowed.
  app.querySelectorAll<HTMLElement>("[data-percent]").forEach((element) => {
    element.style.width = `${element.dataset.percent ?? "0"}%`;
  });
  restoreFocus(focusSnapshot);
}

// ── Draft rows ───────────────────────────────────────────────────────────────

function dropDraftsThatBecameRealRows(): void {
  if (!model) return;
  draftRows = draftRows.filter(
    (draft) =>
      !model?.rows.some(
        (row) =>
          row.projectId === draft.projectId && row.taskId === draft.taskId,
      ),
  );
}

function resetDraftsOnWeekChange(): void {
  if (!model || model.mondayISO === draftsBelongToWeek) return;
  draftsBelongToWeek = model.mondayISO;
  draftRows = [];
  selectedProjectId = "";
  selectedTaskId = "";
}

function addDraftRow(): void {
  if (!model || selectedProjectId === "" || selectedTaskId === "") return;
  const alreadyShown =
    model.rows.some(
      (row) =>
        row.projectId === selectedProjectId && row.taskId === selectedTaskId,
    ) ||
    draftRows.some(
      (draft) =>
        draft.projectId === selectedProjectId &&
        draft.taskId === selectedTaskId,
    );
  if (!alreadyShown) {
    const project = model.projects.find(
      (item) => item.id === selectedProjectId,
    );
    const task = (model.tasksByProject[selectedProjectId] ?? []).find(
      (item) => item.id === selectedTaskId,
    );
    draftRows.push({
      rowKey: `draft_${selectedProjectId}_${selectedTaskId}`,
      projectId: selectedProjectId,
      taskId: selectedTaskId,
      projectName: project?.name ?? selectedProjectId,
      taskName: task?.name ?? selectedTaskId,
    });
  }
  const addedProjectId = selectedProjectId;
  const addedTaskId = selectedTaskId;
  selectedProjectId = "";
  selectedTaskId = "";
  render();
  // Put the cursor in the row's first cell, whether new or already there
  app
    .querySelectorAll<HTMLInputElement>("input[data-project]")
    .forEach((input, _index, allInputs) => {
      const isFirstOfRow =
        input.dataset.project === addedProjectId &&
        input.dataset.task === addedTaskId &&
        allInputs[0] !== undefined;
      if (isFirstOfRow && !app.querySelector(":focus")) input.focus();
    });
}

// ── Editing cells ────────────────────────────────────────────────────────────

function commitCell(input: HTMLInputElement): void {
  const { cellKey, project, task, day, original = "" } = input.dataset;
  if (!cellKey || !project || !task || !day || input.readOnly) return;

  const typedText = input.value.trim();
  let hours: number;
  if (typedText === "") {
    if (original === "") return; // nothing there, nothing typed
    hours = 0; // clearing a cell records an explicit zero, like the web grid
  } else {
    const parsedHours = parseHoursInput(typedText);
    if (parsedHours === null) {
      input.value = original;
      input.classList.add("invalid");
      window.setTimeout(() => input.classList.remove("invalid"), 700);
      return;
    }
    hours = parsedHours;
  }
  if (original !== "" && hours === Number(original)) {
    input.value = original; // same value typed another way ("8.0")
    return;
  }

  pendingValues.set(cellKey, formatPlainHours(hours));
  send({
    type: "setHours",
    cellKey,
    projectId: project,
    taskId: task,
    dayKey: day as BridgeDayKey,
    hours,
  });
  render();
}

// ── Events ───────────────────────────────────────────────────────────────────

app.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const actionElement = target.closest<HTMLElement>("[data-action]");
  if (!actionElement || actionElement.hasAttribute("disabled")) return;

  switch (actionElement.dataset.action) {
    case "navigate":
      send({
        type: "navigate",
        target: actionElement.dataset.target as NavigationTarget,
      });
      break;
    case "command":
      send({
        type: "command",
        command: actionElement.dataset.command as WebviewCommand,
      });
      break;
    case "add-row":
      addDraftRow();
      break;
    case "delete-row":
      send({ type: "deleteRow", rowKey: actionElement.dataset.row ?? "" });
      break;
    case "remove-draft":
      draftRows = draftRows.filter(
        (draft) => draft.rowKey !== actionElement.dataset.row,
      );
      render();
      break;
  }
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.dataset.role === "project") {
    selectedProjectId = target.value;
    selectedTaskId = "";
    render();
  } else if (target.dataset.role === "task") {
    selectedTaskId = target.value;
    render();
  }
});

app.addEventListener("focusin", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.dataset.cellKey) {
    target.select();
  }
});

app.addEventListener("focusout", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.dataset.cellKey) {
    commitCell(target);
  }
});

app.addEventListener("keydown", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.dataset.cellKey) return;
  if (event.key === "Enter") {
    target.blur();
  } else if (event.key === "Escape") {
    target.value = target.dataset.original ?? "";
    target.blur();
  }
});

window.addEventListener(
  "message",
  (event: MessageEvent<ExtensionToWebview>) => {
    const message = event.data;
    if (message.type === "render") {
      model = message.model;
      resetDraftsOnWeekChange();
      dropDraftsThatBecameRealRows();
      render();
    } else if (message.type === "saved") {
      pendingValues.delete(message.cellKey);
      render();
    }
  },
);

render();
send({ type: "ready" });
