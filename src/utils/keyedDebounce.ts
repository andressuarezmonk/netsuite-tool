/**
 * Creates a keyed debounce — multiple independent debounce timers,
 * one per key, stored in a shared Map.
 *
 * Usage:
 *   const debounce = createKeyedDebounce();
 *   debounce("cell_A", 400, () => save("A"));
 *   debounce("cell_B", 400, () => save("B")); // independent timer
 *   debounce("cell_A", 400, () => save("A")); // resets A's timer, B unaffected
 */
export function createKeyedDebounce() {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function debounce(key: string, ms: number, fn: () => void): void {
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        fn();
      }, ms),
    );
  }

  function cancel(key: string): void {
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
      timers.delete(key);
    }
  }

  function cancelByPrefix(prefix: string): void {
    for (const [key, timer] of timers.entries()) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        timers.delete(key);
      }
    }
  }

  return { debounce, cancel, cancelByPrefix };
}
