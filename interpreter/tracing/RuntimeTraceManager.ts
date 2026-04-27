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
import { formatRuntimeTraceSize, summarizeRuntimeTraceValue } from './RuntimeTraceValue';
import type { RuntimeTraceEnvelope } from './events';

const MEMORY_MAJOR_JUMP_BYTES = 64 * 1024 * 1024;
const MEMORY_TOP_DELTA_LIMIT = 8;

type MemoryUsagePoint = {
  label: string;
  phase?: string;
  usage: NodeJS.MemoryUsage;
  scope: RuntimeTraceScope;
};

type MemoryDeltaSummary = {
  label: string;
  phase?: string;
  previousLabel: string;
  previousPhase?: string;
  deltaRss: number;
  deltaHeapUsed: number;
  deltaHeapTotal: number;
  rss: number;
  heapUsed: number;
  scope?: Record<string, unknown>;
  score: number;
};

type MemoryLabelSummary = {
  label: string;
  count: number;
  positiveDeltaRss: number;
  positiveDeltaHeapUsed: number;
  maxRss: number;
  maxHeapUsed: number;
};

type MemorySessionWriteSummary = {
  count: number;
  totalPreviousBytes: number;
  totalValueBytes: number;
  maxPreviousBytes: number;
  maxValueBytes: number;
  maxValuePath?: string;
  maxValueSessionName?: string;
};

type RuntimeMemorySummaryState = {
  sampleCount: number;
  firstSample?: MemoryUsagePoint;
  lastSample?: MemoryUsagePoint;
  peakRss?: MemoryUsagePoint;
  peakHeapUsed?: MemoryUsagePoint;
  firstMajorJump?: MemoryDeltaSummary;
  topDeltas: MemoryDeltaSummary[];
  labels: Map<string, MemoryLabelSummary>;
  sessionWrites: MemorySessionWriteSummary;
  emitted: boolean;
};

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
  memorySummary: RuntimeMemorySummaryState;
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
      memorySummary: createMemorySummaryState(),
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
    this.root.memorySummary = createMemorySummaryState();
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

  shouldEmitTrace(
    requiredLevel: RuntimeTraceEmissionLevel,
    category: RuntimeTraceEnvelope['category']
  ): boolean {
    return shouldEmitRuntimeTrace(this.getLevel(), requiredLevel, category);
  }

  private recordTrace(trace: RuntimeTraceEnvelope, scope: RuntimeTraceScope): RuntimeTraceEvent {
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

  emitTrace(trace: RuntimeTraceEnvelope, scope: RuntimeTraceScope): RuntimeTraceEvent | undefined {
    if (!this.shouldEmitTrace(trace.requiredLevel, trace.category)) {
      return undefined;
    }

    return this.recordTrace(trace, scope);
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
      emitThresholdBytes?: number;
    },
    scope: RuntimeTraceScope
  ): RuntimeTraceEvent | undefined {
    if (!this.root.memory) {
      return undefined;
    }

    if (typeof globalThis.gc === 'function' && process.env.MLLD_TRACE_GC === '1') {
      globalThis.gc();
    }
    const usage = process.memoryUsage();
    const previous = this.root.lastMemorySample;
    const event = args.event ?? (previous ? 'memory.delta' : 'memory.sample');
    const requiredLevel = args.requiredLevel ?? (event === 'memory.gc' ? 'verbose' : 'effects');
    const deltaScore = previous
      ? Math.max(
          usage.rss - previous.usage.rss,
          usage.heapUsed - previous.usage.heapUsed,
          usage.heapTotal - previous.usage.heapTotal,
          0
        )
      : Number.POSITIVE_INFINITY;
    const meetsEmitThreshold =
      args.emitThresholdBytes === undefined ||
      deltaScore >= args.emitThresholdBytes;
    const shouldEmit =
      meetsEmitThreshold &&
      (
        this.shouldEmitTrace(requiredLevel, 'memory') ||
        requiredLevel === 'effects'
      );
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

    this.recordMemorySummaryObservation({
      label: args.label,
      phase: args.phase,
      usage,
      data,
      scope
    });

    const payload = shouldEmit
      ? this.recordTrace(
          {
            requiredLevel,
            category: 'memory',
            event,
            data
          },
          scope
        )
      : undefined;

    if (payload || args.emitThresholdBytes !== undefined) {
      this.root.lastMemorySample = {
        label: args.label,
        usage
      };
    }

    if (args.label === 'run' && args.phase === 'finish') {
      this.emitMemorySummary(scope);
    }

    return payload;
  }

  private recordMemorySummaryObservation(args: {
    label: string;
    phase?: string;
    usage: NodeJS.MemoryUsage;
    data: Record<string, unknown>;
    scope: RuntimeTraceScope;
  }): void {
    const summary = this.root.memorySummary;
    const point: MemoryUsagePoint = {
      label: args.label,
      ...(args.phase ? { phase: args.phase } : {}),
      usage: args.usage,
      scope: compactMemoryScope(args.scope)
    };

    summary.sampleCount += 1;
    summary.firstSample ??= point;
    summary.peakRss = !summary.peakRss || args.usage.rss > summary.peakRss.usage.rss
      ? point
      : summary.peakRss;
    summary.peakHeapUsed = !summary.peakHeapUsed || args.usage.heapUsed > summary.peakHeapUsed.usage.heapUsed
      ? point
      : summary.peakHeapUsed;

    const previous = summary.lastSample;
    if (previous) {
      const delta = buildMemoryDeltaSummary(previous, point);
      if (delta.score > 0) {
        insertTopMemoryDelta(summary.topDeltas, delta);
      }
      if (
        !summary.firstMajorJump &&
        (delta.deltaRss >= MEMORY_MAJOR_JUMP_BYTES || delta.deltaHeapUsed >= MEMORY_MAJOR_JUMP_BYTES)
      ) {
        summary.firstMajorJump = delta;
      }
      updateMemoryLabelSummary(summary.labels, point, delta);
    } else {
      updateMemoryLabelSummary(summary.labels, point);
    }

    if (args.label === 'session.write') {
      updateSessionWriteSummary(summary.sessionWrites, args.data);
    }

    summary.lastSample = point;
  }

  private emitMemorySummary(scope: RuntimeTraceScope): RuntimeTraceEvent | undefined {
    if (!this.root.memory || this.root.memorySummary.emitted || this.root.memorySummary.sampleCount === 0) {
      return undefined;
    }
    this.root.memorySummary.emitted = true;
    return this.recordTrace(
      {
        requiredLevel: 'effects',
        category: 'memory',
        event: 'memory.summary',
        data: buildMemorySummaryTraceData(this.root.memorySummary)
      },
      scope
    );
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

function createMemorySummaryState(): RuntimeMemorySummaryState {
  return {
    sampleCount: 0,
    topDeltas: [],
    labels: new Map(),
    sessionWrites: {
      count: 0,
      totalPreviousBytes: 0,
      totalValueBytes: 0,
      maxPreviousBytes: 0,
      maxValueBytes: 0
    },
    emitted: false
  };
}

function compactMemoryScope(scope: RuntimeTraceScope): RuntimeTraceScope {
  const compact: RuntimeTraceScope = {};
  for (const key of ['exe', 'operation', 'box', 'file', 'frameId', 'parentFrameId', 'pipeline_stage']) {
    const value = scope[key];
    if (value !== undefined && value !== null && value !== '') {
      compact[key] = value;
    }
  }
  return compact;
}

function buildMemoryDeltaSummary(previous: MemoryUsagePoint, current: MemoryUsagePoint): MemoryDeltaSummary {
  const deltaRss = current.usage.rss - previous.usage.rss;
  const deltaHeapUsed = current.usage.heapUsed - previous.usage.heapUsed;
  const deltaHeapTotal = current.usage.heapTotal - previous.usage.heapTotal;
  return {
    label: current.label,
    ...(current.phase ? { phase: current.phase } : {}),
    previousLabel: previous.label,
    ...(previous.phase ? { previousPhase: previous.phase } : {}),
    deltaRss,
    deltaHeapUsed,
    deltaHeapTotal,
    rss: current.usage.rss,
    heapUsed: current.usage.heapUsed,
    ...(Object.keys(current.scope).length > 0 ? { scope: current.scope } : {}),
    score: Math.max(deltaRss, deltaHeapUsed, deltaHeapTotal, 0)
  };
}

function insertTopMemoryDelta(topDeltas: MemoryDeltaSummary[], delta: MemoryDeltaSummary): void {
  topDeltas.push(delta);
  topDeltas.sort((a, b) => b.score - a.score);
  if (topDeltas.length > MEMORY_TOP_DELTA_LIMIT) {
    topDeltas.length = MEMORY_TOP_DELTA_LIMIT;
  }
}

function updateMemoryLabelSummary(
  labels: Map<string, MemoryLabelSummary>,
  point: MemoryUsagePoint,
  delta?: MemoryDeltaSummary
): void {
  const existing = labels.get(point.label) ?? {
    label: point.label,
    count: 0,
    positiveDeltaRss: 0,
    positiveDeltaHeapUsed: 0,
    maxRss: 0,
    maxHeapUsed: 0
  };
  existing.count += 1;
  existing.maxRss = Math.max(existing.maxRss, point.usage.rss);
  existing.maxHeapUsed = Math.max(existing.maxHeapUsed, point.usage.heapUsed);
  if (delta) {
    existing.positiveDeltaRss += Math.max(delta.deltaRss, 0);
    existing.positiveDeltaHeapUsed += Math.max(delta.deltaHeapUsed, 0);
  }
  labels.set(point.label, existing);
}

function updateSessionWriteSummary(summary: MemorySessionWriteSummary, data: Record<string, unknown>): void {
  summary.count += 1;
  const previousBytes = typeof data.previousBytes === 'number' && Number.isFinite(data.previousBytes)
    ? data.previousBytes
    : 0;
  const valueBytes = typeof data.valueBytes === 'number' && Number.isFinite(data.valueBytes)
    ? data.valueBytes
    : 0;
  summary.totalPreviousBytes += previousBytes;
  summary.totalValueBytes += valueBytes;
  summary.maxPreviousBytes = Math.max(summary.maxPreviousBytes, previousBytes);
  if (valueBytes > summary.maxValueBytes) {
    summary.maxValueBytes = valueBytes;
    if (typeof data.path === 'string') {
      summary.maxValuePath = data.path;
    }
    if (typeof data.sessionName === 'string') {
      summary.maxValueSessionName = data.sessionName;
    }
  }
}

function buildMemorySummaryTraceData(summary: RuntimeMemorySummaryState): Record<string, unknown> {
  const sessionWrites = summary.sessionWrites.count > 0
    ? {
        ...summary.sessionWrites,
        totalPreviousHuman: formatRuntimeTraceSize(summary.sessionWrites.totalPreviousBytes),
        totalValueHuman: formatRuntimeTraceSize(summary.sessionWrites.totalValueBytes),
        maxPreviousHuman: formatRuntimeTraceSize(summary.sessionWrites.maxPreviousBytes),
        maxValueHuman: formatRuntimeTraceSize(summary.sessionWrites.maxValueBytes)
      }
    : undefined;

  return {
    sampleCount: summary.sampleCount,
    majorJumpBytes: MEMORY_MAJOR_JUMP_BYTES,
    majorJumpHuman: formatRuntimeTraceSize(MEMORY_MAJOR_JUMP_BYTES),
    topDeltaLimit: MEMORY_TOP_DELTA_LIMIT,
    ...(summary.firstSample ? { firstSample: formatMemoryPoint(summary.firstSample) } : {}),
    ...(summary.lastSample ? { finalSample: formatMemoryPoint(summary.lastSample) } : {}),
    ...(summary.peakRss ? { peakRss: formatMemoryPoint(summary.peakRss, 'rss') } : {}),
    ...(summary.peakHeapUsed ? { peakHeapUsed: formatMemoryPoint(summary.peakHeapUsed, 'heapUsed') } : {}),
    ...(summary.firstMajorJump ? { firstMajorJump: formatMemoryDelta(summary.firstMajorJump) } : {}),
    topDeltas: summary.topDeltas.map(formatMemoryDelta),
    topLabels: Array.from(summary.labels.values())
      .sort((a, b) =>
        Math.max(b.positiveDeltaRss, b.positiveDeltaHeapUsed) -
        Math.max(a.positiveDeltaRss, a.positiveDeltaHeapUsed)
      )
      .slice(0, MEMORY_TOP_DELTA_LIMIT)
      .map(formatMemoryLabelSummary),
    ...(sessionWrites ? { sessionWrites } : {})
  };
}

function formatMemoryPoint(point: MemoryUsagePoint, peakBy?: 'rss' | 'heapUsed'): Record<string, unknown> {
  return {
    label: point.label,
    ...(point.phase ? { phase: point.phase } : {}),
    rss: point.usage.rss,
    rssHuman: formatRuntimeTraceSize(point.usage.rss),
    heapUsed: point.usage.heapUsed,
    heapUsedHuman: formatRuntimeTraceSize(point.usage.heapUsed),
    ...(peakBy ? { peakBy } : {}),
    ...(Object.keys(point.scope).length > 0 ? { scope: { ...point.scope } } : {})
  };
}

function formatMemoryDelta(delta: MemoryDeltaSummary): Record<string, unknown> {
  return {
    label: delta.label,
    ...(delta.phase ? { phase: delta.phase } : {}),
    previousLabel: delta.previousLabel,
    ...(delta.previousPhase ? { previousPhase: delta.previousPhase } : {}),
    deltaRss: delta.deltaRss,
    deltaRssHuman: formatRuntimeTraceSize(delta.deltaRss),
    deltaHeapUsed: delta.deltaHeapUsed,
    deltaHeapUsedHuman: formatRuntimeTraceSize(delta.deltaHeapUsed),
    deltaHeapTotal: delta.deltaHeapTotal,
    rss: delta.rss,
    heapUsed: delta.heapUsed,
    ...(delta.scope ? { scope: { ...delta.scope } } : {})
  };
}

function formatMemoryLabelSummary(label: MemoryLabelSummary): Record<string, unknown> {
  return {
    ...label,
    positiveDeltaRssHuman: formatRuntimeTraceSize(label.positiveDeltaRss),
    positiveDeltaHeapUsedHuman: formatRuntimeTraceSize(label.positiveDeltaHeapUsed),
    maxRssHuman: formatRuntimeTraceSize(label.maxRss),
    maxHeapUsedHuman: formatRuntimeTraceSize(label.maxHeapUsed)
  };
}
