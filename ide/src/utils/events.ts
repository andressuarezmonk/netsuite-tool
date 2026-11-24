// A minimal event emitter with no `vscode` dependency, so the bridge code can
// run (and be tested) outside the extension host. Its `Event` type is
// structurally compatible with `vscode.Event`.

export interface Disposable {
  dispose(): void;
}

export type Event<Value> = (listener: (value: Value) => void) => Disposable;

export class SimpleEventEmitter<Value> implements Disposable {
  private readonly listeners = new Set<(value: Value) => void>();

  readonly event: Event<Value> = (listener) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  fire(value: Value): void {
    [...this.listeners].forEach((listener) => listener(value));
  }

  dispose(): void {
    this.listeners.clear();
  }
}
