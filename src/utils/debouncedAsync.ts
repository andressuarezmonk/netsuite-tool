/**
 * Creates a keyed async debounce.
 * Each call with the same key cancels the previous pending call and schedules
 * a new one. Returns a Promise that resolves or rejects when the debounced
 * async function eventually runs.
 *
 * Usage:
 *   const debounce = createKeyedAsyncDebounce();
 *   await debounce("cell_A", 400, async () => { await save("A"); });
 */
export function createKeyedAsyncDebounce() {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function debounce<T>(
    key: string,
    ms: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);

    return new Promise<T>((resolve, reject) => {
      timers.set(
        key,
        setTimeout(async () => {
          timers.delete(key);
          try {
            resolve(await fn());
          } catch (err) {
            reject(err);
          }
        }, ms),
      );
    });
  }

  function cancelByPrefix(prefix: string): void {
    for (const [key, timer] of timers.entries()) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        timers.delete(key);
      }
    }
  }

  return { debounce, cancelByPrefix };
}
