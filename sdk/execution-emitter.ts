import type { SDKEvent, SDKEventHandler } from './types';

export class ExecutionEmitter {
  private listeners: Map<SDKEvent['type'], Set<SDKEventHandler>> = new Map();

  on(type: SDKEvent['type'], handler: SDKEventHandler): void {
    const bucket = this.listeners.get(type) ?? new Set<SDKEventHandler>();
    bucket.add(handler);
    this.listeners.set(type, bucket);
  }

  off(type: SDKEvent['type'], handler: SDKEventHandler): void {
    const bucket = this.listeners.get(type);
    if (!bucket) return;
    bucket.delete(handler);
    if (bucket.size === 0) {
      this.listeners.delete(type);
    }
  }

  once(type: SDKEvent['type'], handler: SDKEventHandler): void {
    const wrapper: SDKEventHandler = (event) => {
      this.off(type, wrapper);
      handler(event);
    };
    this.on(type, wrapper);
  }

  emit(event: SDKEvent): void {
    const bucket = this.listeners.get(event.type);
    if (!bucket || bucket.size === 0) {
      return;
    }
    for (const handler of [...bucket]) {
      try {
        handler(event);
      } catch (err) {
        // Swallow handler errors to avoid breaking execution; debug handlers should be resilient.
        if (process.env.MLLD_DEBUG) {
          console.error('[ExecutionEmitter] Handler error for event type:', event.type, err);
        }
      }
    }
  }
}
