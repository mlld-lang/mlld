import { appendFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import { sanitizeSerializableValue } from '@core/errors/errorSerialization';
import {
  normalizeRuntimeTraceLevel,
  shouldEmitRuntimeTrace,
  type RuntimeTraceEvent,
  type RuntimeTraceLevel,
  type RuntimeTraceOptions,
  type RuntimeTraceScope
} from '@core/types/trace';
import { formatRuntimeTraceLine } from './RuntimeTraceFormatter';
import { RuntimeTraceShelfTracker } from './RuntimeTraceShelfTracker';
import { summarizeRuntimeTraceValue } from './RuntimeTraceValue';
import type { RuntimeTraceEnvelope } from './events';

type RuntimeTraceRootState = {
  level: RuntimeTraceLevel;
  events: RuntimeTraceEvent[];
  filePath?: string;
  stderr: boolean;
  shelfTracker: RuntimeTraceShelfTracker;
};

export class RuntimeTraceManager {
  private readonly root: RuntimeTraceRootState;
  private overrideLevel?: RuntimeTraceLevel;

  constructor(private readonly parent?: RuntimeTraceManager) {
    this.root = parent?.root ?? {
      level: 'off',
      events: [],
      stderr: false,
      shelfTracker: new RuntimeTraceShelfTracker()
    };
  }

  createChild(): RuntimeTraceManager {
    return new RuntimeTraceManager(this);
  }

  configure(level: RuntimeTraceLevel, options: RuntimeTraceOptions = {}): void {
    this.root.level = normalizeRuntimeTraceLevel(level);
    this.root.filePath = options.filePath ? path.resolve(options.filePath) : undefined;
    this.root.stderr = options.stderr === true;
    if (level === 'off') {
      this.root.events = [];
      this.root.shelfTracker.clear();
    }
  }

  setOverride(level?: RuntimeTraceLevel): void {
    this.overrideLevel = level === undefined ? undefined : normalizeRuntimeTraceLevel(level);
  }

  getLevel(): RuntimeTraceLevel {
    if (this.overrideLevel !== undefined) {
      return this.overrideLevel;
    }
    return this.parent?.getLevel() ?? this.root.level;
  }

  getEvents(): RuntimeTraceEvent[] {
    return [...this.root.events];
  }

  emitTrace(trace: RuntimeTraceEnvelope, scope: RuntimeTraceScope): void {
    if (!shouldEmitRuntimeTrace(this.getLevel(), trace.requiredLevel, trace.category)) {
      return;
    }

    const payload: RuntimeTraceEvent = {
      ts: new Date().toISOString(),
      level: trace.requiredLevel,
      category: trace.category,
      event: trace.event,
      scope: {
        ...scope,
        ...(trace.scope ?? {})
      },
      data: sanitizeSerializableValue(trace.data) as Record<string, unknown>
    };

    this.root.events.push(payload);

    if (this.root.filePath) {
      try {
        mkdirSync(path.dirname(this.root.filePath), { recursive: true });
        appendFileSync(this.root.filePath, `${JSON.stringify(payload)}\n`, 'utf8');
      } catch {
        // Best-effort file sink; trace collection still succeeds in memory.
      }
    }

    if (this.root.stderr) {
      process.stderr.write(`${formatRuntimeTraceLine(payload)}\n`);
    }
  }

  summarizeValue(value: unknown): unknown {
    return summarizeRuntimeTraceValue(value);
  }

  recordShelfWrite(slot: string, value: unknown, scope: RuntimeTraceScope): void {
    if (this.getLevel() === 'off') {
      return;
    }

    this.root.shelfTracker.recordWrite(slot, value, scope);
  }

  emitStaleShelfRead(
    slot: string,
    value: unknown,
    readTs: string,
    scope: RuntimeTraceScope
  ): void {
    if (this.getLevel() === 'off') {
      return;
    }

    const trace = this.root.shelfTracker.buildStaleReadEvent(slot, value, readTs, scope);
    if (trace) {
      this.emitTrace(trace, scope);
    }
  }
}
