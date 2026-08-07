/**
 * Per-row pending-save gate.
 *
 * Tracks in-flight save promises keyed by rowKey.
 * Delete operations await the gate before proceeding so they never race
 * against a save that hasn't completed yet.
 */

const _pending = new Map<string, Promise<void>>();

/**
 * Register a save promise for a row.
 * Automatically clears itself from the map when it settles.
 */
export function registerSave(rowKey: string, promise: Promise<void>): void {
  _pending.set(rowKey, promise);
  promise.finally(() => {
    // Only clear if this promise is still the registered one
    // (a later save may have replaced it)
    if (_pending.get(rowKey) === promise) {
      _pending.delete(rowKey);
    }
  });
}

/**
 * Wait for any in-flight save on this row to settle.
 * Resolves immediately if no save is pending.
 * Never rejects — errors from the pending save are swallowed here
 * (the save itself already handles its own error reporting).
 */
export async function waitForRowSave(rowKey: string): Promise<void> {
  const pending = _pending.get(rowKey);
  if (!pending) return;
  try {
    await pending;
  } catch {
    // Swallow — the save handler already reported the error to the user
  }
}
