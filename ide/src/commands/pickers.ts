import * as vscode from "vscode";

interface PickOptions {
  placeholder: string;
  title?: string;
}

/**
 * Quick pick that can pre-highlight an item. Resolves to undefined when the
 * user dismisses it (Esc), which callers treat as "cancel the whole flow".
 */
export function pickOne<Item extends vscode.QuickPickItem>(
  items: Item[],
  options: PickOptions,
  initiallyActiveItem?: Item,
): Promise<Item | undefined> {
  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick<Item>();
    quickPick.items = items;
    quickPick.placeholder = options.placeholder;
    quickPick.title = options.title;
    quickPick.matchOnDescription = true;
    if (initiallyActiveItem) quickPick.activeItems = [initiallyActiveItem];

    let isResolved = false;
    const finish = (selectedItem: Item | undefined) => {
      if (isResolved) return;
      isResolved = true;
      resolve(selectedItem);
      quickPick.dispose();
    };
    quickPick.onDidAccept(() => finish(quickPick.selectedItems[0]));
    quickPick.onDidHide(() => finish(undefined));
    quickPick.show();
  });
}
