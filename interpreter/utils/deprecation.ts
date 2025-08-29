/**
 * Deprecation tracking utility.
 * - Ensures each deprecation warning is emitted once per key
 * - Collects messages for optional inspection in tests or tooling
 */
export class DeprecationTracker {
  private static _instance: DeprecationTracker | null = null;
  private readonly seen = new Set<string>();
  private readonly messages: { key: string; message: string }[] = [];

  static get instance(): DeprecationTracker {
    if (!this._instance) this._instance = new DeprecationTracker();
    return this._instance;
  }

  warnOnce(key: string, message: string): void {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.messages.push({ key, message });
    try {
      // eslint-disable-next-line no-console
      console.warn(message);
    } catch {
      // ignore console failures
    }
  }

  getWarnings(): { key: string; message: string }[] {
    return [...this.messages];
  }

  reset(): void {
    this.seen.clear();
    this.messages.length = 0;
  }
}

// Convenience helpers
export function deprecateOnce(key: string, message: string): void {
  DeprecationTracker.instance.warnOnce(key, message);
}

export function getDeprecationWarnings(): { key: string; message: string }[] {
  return DeprecationTracker.instance.getWarnings();
}

export function resetDeprecationWarnings(): void {
  DeprecationTracker.instance.reset();
}

