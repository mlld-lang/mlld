export type LifecycleTraceScope = 'hook' | 'guard' | 'operation';
export type LifecycleTracePhase = 'before' | 'after' | 'error' | 'decision';

export interface LifecycleTraceEvent {
  id: number;
  scope: LifecycleTraceScope;
  phase: LifecycleTracePhase;
  operation: string;
  detail?: string;
}

/**
 * Test-only trace helper for hook/guard lifecycle characterization.
 * This intentionally stays lightweight so future lifecycle tests can
 * capture ordering in one place.
 */
export class HookLifecycleTrace {
  private readonly events: LifecycleTraceEvent[] = [];
  private nextId = 1;

  record(
    scope: LifecycleTraceScope,
    phase: LifecycleTracePhase,
    operation: string,
    detail?: string
  ): LifecycleTraceEvent {
    const event: LifecycleTraceEvent = {
      id: this.nextId++,
      scope,
      phase,
      operation,
      ...(detail ? { detail } : {})
    };
    this.events.push(event);
    return event;
  }

  snapshot(): readonly LifecycleTraceEvent[] {
    return this.events.map(event => ({ ...event }));
  }

  sequence(): string[] {
    return this.events.map(event => `${event.scope}:${event.phase}:${event.operation}`);
  }

  format(): string {
    return this.events
      .map(event => {
        const suffix = event.detail ? ` (${event.detail})` : '';
        return `${event.id}. ${event.scope}:${event.phase}:${event.operation}${suffix}`;
      })
      .join('\n');
  }

  clear(): void {
    this.events.length = 0;
    this.nextId = 1;
  }
}

export function createHookLifecycleTrace(): HookLifecycleTrace {
  return new HookLifecycleTrace();
}
