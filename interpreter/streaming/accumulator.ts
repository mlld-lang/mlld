/**
 * Streaming Accumulator
 *
 * Accumulates data from parsed streaming events into a structured result.
 * Supports configurable accumulation strategies:
 * - concat: Concatenate string values (e.g., text chunks → full text)
 * - collect: Collect items into an array (e.g., tool uses → toolCalls[])
 * - capture: Capture the last value (e.g., usage metadata)
 */

import type { ParsedEvent, ParsedEventKind } from './adapters/base';
import type {
  StreamingResult,
  StreamingToolCall,
  SDKStreamingEvent,
  SDKStreamingErrorEvent
} from '@sdk/types';

export interface ConcatConfig {
  from: ParsedEventKind[];
  field: string;
  separator?: string;
  to: keyof StreamingResult;
}

export interface CollectConfig {
  from: ParsedEventKind[];
  transform?: (data: Record<string, unknown>) => unknown;
  to: keyof StreamingResult;
}

export interface CaptureConfig {
  from: ParsedEventKind[];
  field?: string;
  transform?: (data: Record<string, unknown>) => unknown;
  to: keyof StreamingResult;
}

export interface AccumulationConfig {
  concat?: ConcatConfig[];
  collect?: CollectConfig[];
  capture?: CaptureConfig[];
}

export interface AccumulatorOptions {
  config?: AccumulationConfig;
  trackProgress?: boolean;
  onProgress?: (progress: AccumulationProgress) => void;
}

export interface AccumulationProgress {
  field: string;
  value: unknown;
  count: number;
  complete: boolean;
}

/**
 * Default accumulation configuration for common streaming patterns.
 */
export const DEFAULT_ACCUMULATION_CONFIG: AccumulationConfig = {
  concat: [
    { from: ['message'], field: 'chunk', to: 'text' },
    { from: ['thinking'], field: 'text', to: 'thinking' }
  ],
  collect: [
    {
      from: ['tool-use'],
      transform: (data) => ({
        name: data.name,
        input: data.input,
        id: data.id
      } as StreamingToolCall),
      to: 'toolCalls'
    }
  ],
  capture: [
    {
      from: ['metadata'],
      transform: (data) => ({
        inputTokens: data.inputTokens as number | undefined,
        outputTokens: data.outputTokens as number | undefined,
        totalTokens: ((data.inputTokens as number) || 0) + ((data.outputTokens as number) || 0)
      }),
      to: 'usage'
    }
  ]
};

export class StreamingAccumulator {
  private config: AccumulationConfig;
  private trackProgress: boolean;
  private onProgress?: (progress: AccumulationProgress) => void;

  // Accumulation state
  private concatBuffers: Map<string, string[]> = new Map();
  private collectBuffers: Map<string, unknown[]> = new Map();
  private captureValues: Map<string, unknown> = new Map();
  private errors: SDKStreamingErrorEvent[] = [];
  private allEvents: SDKStreamingEvent[] = [];
  private counts: Map<string, number> = new Map();

  // Tool call tracking for result matching
  private toolCallsById: Map<string, StreamingToolCall> = new Map();

  constructor(options: AccumulatorOptions = {}) {
    this.config = options.config || DEFAULT_ACCUMULATION_CONFIG;
    this.trackProgress = options.trackProgress || false;
    this.onProgress = options.onProgress;

    // Initialize buffers
    this.initializeBuffers();
  }

  private initializeBuffers(): void {
    // Initialize concat buffers
    for (const cfg of this.config.concat || []) {
      this.concatBuffers.set(cfg.to, []);
      this.counts.set(cfg.to, 0);
    }

    // Initialize collect buffers
    for (const cfg of this.config.collect || []) {
      this.collectBuffers.set(cfg.to, []);
      this.counts.set(cfg.to, 0);
    }

    // Initialize capture values
    for (const cfg of this.config.capture || []) {
      this.counts.set(cfg.to, 0);
    }
  }

  /**
   * Accumulate a parsed event.
   */
  accumulate(event: ParsedEvent): void {
    const { kind, data } = event;

    // Process concat rules
    for (const cfg of this.config.concat || []) {
      if (cfg.from.includes(kind)) {
        const value = data[cfg.field];
        if (value !== undefined && value !== null) {
          const buffer = this.concatBuffers.get(cfg.to) || [];
          buffer.push(String(value));
          this.concatBuffers.set(cfg.to, buffer);
          this.incrementCount(cfg.to);
          this.emitProgress(cfg.to, buffer.join(cfg.separator || ''));
        }
      }
    }

    // Process collect rules
    for (const cfg of this.config.collect || []) {
      if (cfg.from.includes(kind)) {
        const buffer = this.collectBuffers.get(cfg.to) || [];
        const item = cfg.transform ? cfg.transform(data) : data;
        buffer.push(item);
        this.collectBuffers.set(cfg.to, buffer);

        // Track tool calls by ID for result matching
        if (cfg.to === 'toolCalls' && item && typeof item === 'object') {
          const toolCall = item as StreamingToolCall;
          if (toolCall.id) {
            this.toolCallsById.set(toolCall.id, toolCall);
          }
        }

        this.incrementCount(cfg.to);
        this.emitProgress(cfg.to, buffer);
      }
    }

    // Process capture rules
    for (const cfg of this.config.capture || []) {
      if (cfg.from.includes(kind)) {
        const value = cfg.transform ? cfg.transform(data) : (cfg.field ? data[cfg.field] : data);
        this.captureValues.set(cfg.to, value);
        this.incrementCount(cfg.to);
        this.emitProgress(cfg.to, value);
      }
    }

    // Handle tool results - match with tool calls
    if (kind === 'tool-result') {
      const toolUseId = data.toolUseId as string | undefined;
      if (toolUseId && this.toolCallsById.has(toolUseId)) {
        const toolCall = this.toolCallsById.get(toolUseId)!;
        toolCall.result = data.result;
        toolCall.success = data.success as boolean | undefined;
      }
    }
  }

  /**
   * Accumulate an SDK event.
   */
  accumulateSDKEvent(event: SDKStreamingEvent): void {
    // Store all events if tracking
    this.allEvents.push(event);

    // Handle errors specially
    if (event.type === 'streaming:error') {
      this.errors.push(event);
    }
  }

  /**
   * Get the accumulated result.
   */
  getResult(): StreamingResult {
    const result: StreamingResult = {};

    // Build concat results
    for (const cfg of this.config.concat || []) {
      const buffer = this.concatBuffers.get(cfg.to);
      if (buffer && buffer.length > 0) {
        const joined = buffer.join(cfg.separator || '');
        (result as Record<string, unknown>)[cfg.to] = joined;
      }
    }

    // Build collect results
    for (const cfg of this.config.collect || []) {
      const buffer = this.collectBuffers.get(cfg.to);
      if (buffer && buffer.length > 0) {
        (result as Record<string, unknown>)[cfg.to] = [...buffer];
      }
    }

    // Build capture results
    for (const cfg of this.config.capture || []) {
      const value = this.captureValues.get(cfg.to);
      if (value !== undefined) {
        (result as Record<string, unknown>)[cfg.to] = value;
      }
    }

    // Add errors
    if (this.errors.length > 0) {
      result.errors = [...this.errors];
    }

    return result;
  }

  /**
   * Get all accumulated events (when tracking is enabled).
   */
  getEvents(): SDKStreamingEvent[] {
    return [...this.allEvents];
  }

  /**
   * Reset the accumulator state.
   */
  reset(): void {
    this.concatBuffers.clear();
    this.collectBuffers.clear();
    this.captureValues.clear();
    this.toolCallsById.clear();
    this.errors = [];
    this.allEvents = [];
    this.counts.clear();
    this.initializeBuffers();
  }

  private incrementCount(field: string): void {
    const current = this.counts.get(field) || 0;
    this.counts.set(field, current + 1);
  }

  private emitProgress(field: string, value: unknown): void {
    if (this.trackProgress && this.onProgress) {
      this.onProgress({
        field,
        value,
        count: this.counts.get(field) || 0,
        complete: false
      });
    }
  }
}

/**
 * Create an accumulator with default configuration.
 */
export function createAccumulator(options?: AccumulatorOptions): StreamingAccumulator {
  return new StreamingAccumulator(options);
}

/**
 * Create a simple accumulator that just concatenates text.
 */
export function createTextAccumulator(): StreamingAccumulator {
  return new StreamingAccumulator({
    config: {
      concat: [
        { from: ['message'], field: 'chunk', to: 'text' }
      ]
    }
  });
}

/**
 * Create an accumulator with progress tracking.
 */
export function createProgressAccumulator(
  onProgress: (progress: AccumulationProgress) => void
): StreamingAccumulator {
  return new StreamingAccumulator({
    trackProgress: true,
    onProgress
  });
}
