import { appendFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import { sanitizeSerializableValue } from '@core/errors/errorSerialization';
import {
  normalizeRuntimeTraceLevel,
  shouldEmitRuntimeTrace,
  type RuntimeTraceEvent,
  type RuntimeTraceEmissionLevel,
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
  memory: boolean;
  retainLimit?: number;
  lastMemorySample?: {
    label: string;
    usage: NodeJS.MemoryUsage;
  };
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
      memory: false,
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
    this.root.memory = options.memory === true;
    this.root.retainLimit =
      typeof options.retainLimit === 'number' && Number.isFinite(options.retainLimit) && options.retainLimit >= 0
        ? Math.floor(options.retainLimit)
        : this.root.memory && this.root.filePath
          ? 10000
          : undefined;
    this.root.lastMemorySample = undefined;
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

  emitTrace(trace: RuntimeTraceEnvelope, scope: RuntimeTraceScope): RuntimeTraceEvent | undefined {
    if (!shouldEmitRuntimeTrace(this.getLevel(), trace.requiredLevel, trace.category)) {
      return undefined;
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

    if (this.root.retainLimit !== 0) {
      this.root.events.push(payload);
      if (this.root.retainLimit !== undefined && this.root.events.length > this.root.retainLimit) {
        this.root.events.splice(0, this.root.events.length - this.root.retainLimit);
      }
    }

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

    return payload;
  }

  isMemoryEnabled(): boolean {
    return this.root.memory;
  }

  emitMemoryTrace(
    args: {
      label: string;
      phase?: string;
      requiredLevel?: RuntimeTraceEmissionLevel;
      event?: 'memory.sample' | 'memory.delta' | 'memory.gc' | 'memory.pressure';
      data?: Record<string, unknown>;
    },
    scope: RuntimeTraceScope
  ): RuntimeTraceEvent | undefined {
    if (!this.root.memory) {
      return undefined;
    }

    const usage = process.memoryUsage();
    const previous = this.root.lastMemorySample;
    const event = args.event ?? (previous ? 'memory.delta' : 'memory.sample');
    const data = {
      label: args.label,
      ...(args.phase ? { phase: args.phase } : {}),
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      ...(previous
        ? {
            deltaRss: usage.rss - previous.usage.rss,
            deltaHeapUsed: usage.heapUsed - previous.usage.heapUsed,
            deltaHeapTotal: usage.heapTotal - previous.usage.heapTotal,
            deltaExternal: usage.external - previous.usage.external,
            deltaArrayBuffers: usage.arrayBuffers - previous.usage.arrayBuffers,
            previousLabel: previous.label
          }
        : {}),
      ...args.data
    };

    const payload = this.emitTrace(
      {
        requiredLevel: args.requiredLevel ?? (event === 'memory.gc' ? 'verbose' : 'effects'),
        category: 'memory',
        event,
        data
      },
      scope
    );

    if (payload) {
      this.root.lastMemorySample = {
        label: args.label,
        usage
      };
    }

    return payload;
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
