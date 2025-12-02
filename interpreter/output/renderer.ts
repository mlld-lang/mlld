import type { OutputIntent } from './intent';
import { normalizeOutput } from './normalizer';

/**
 * Output Renderer
 *
 * Buffers output intents, collapses adjacent breaks, and produces
 * normalized output. Uses smart buffering to preserve streaming:
 * - Content/progress/error emit immediately (after flushing breaks)
 * - Breaks buffer for look-ahead collapsing
 *
 * This enables:
 * - Automatic blank line normalization (fixes #396)
 * - Clean separation from Prettier (fixes #281)
 * - Foundation for streaming format adapters
 */
export class OutputRenderer {
  /** Pending collapsible breaks waiting for next content */
  private pendingBreaks: OutputIntent[] = [];

  /** Callback to emit intents to effect handler */
  private emitCallback?: (intent: OutputIntent) => void;

  /**
   * Create a new OutputRenderer
   *
   * @param emitCallback Optional callback to emit intents immediately
   */
  constructor(emitCallback?: (intent: OutputIntent) => void) {
    this.emitCallback = emitCallback;
  }

  /**
   * Emit an output intent
   *
   * Smart buffering strategy:
   * - Collapsible breaks: Buffer for potential collapsing
   * - Non-collapsible breaks: Flush pending, emit immediately
   * - Content/progress/error: Flush pending breaks, emit immediately
   *
   * This preserves streaming while enabling break collapsing.
   */
  emit(intent: OutputIntent): void {
    if (intent.type === 'break' && intent.collapsible) {
      // Buffer collapsible breaks for potential collapsing
      this.pendingBreaks.push(intent);
    } else {
      // Flush pending breaks first
      this.flushBreaks();

      // Emit non-collapsible breaks immediately
      if (intent.type === 'break' && !intent.collapsible) {
        this.emitToHandler(intent);
      } else {
        // Content/progress/error emit immediately
        this.emitToHandler(intent);
      }
    }
  }

  /**
   * Flush pending breaks
   *
   * Collapses adjacent collapsible breaks into a single break.
   * Called automatically when content arrives.
   */
  private flushBreaks(): void {
    if (this.pendingBreaks.length === 0) return;

    // Collapse: Keep only the first break
    const collapsed = this.pendingBreaks[0];
    this.emitToHandler(collapsed);

    this.pendingBreaks = [];
  }

  /**
   * Emit intent to handler callback
   */
  private emitToHandler(intent: OutputIntent): void {
    if (this.emitCallback) {
      this.emitCallback(intent);
    }
  }

  /**
   * Render final output (for end-of-execution)
   *
   * Flushes any remaining pending breaks and applies normalization.
   * Call this at the end of document execution.
   */
  render(): void {
    // Flush any trailing breaks
    this.flushBreaks();
  }

  /**
   * Clear all pending state
   *
   * Useful for testing or resetting renderer state.
   */
  clear(): void {
    this.pendingBreaks = [];
  }

  /**
   * Get pending break count (for testing/debugging)
   */
  getPendingBreakCount(): number {
    return this.pendingBreaks.length;
  }
}

/**
 * Intent-to-string renderer for document assembly
 *
 * This variant accumulates intents in memory and produces
 * a final normalized document string. Used by EffectHandler
 * for document buffer assembly.
 */
export class DocumentRenderer {
  private buffer: string[] = [];

  /**
   * Emit an intent to the document buffer
   */
  emit(intent: OutputIntent): void {
    // Only doc and content types go to document
    if (intent.type === 'content' || intent.type === 'break') {
      this.buffer.push(intent.value);
    }
  }

  /**
   * Get the rendered document with normalization
   */
  getDocument(): string {
    const raw = this.buffer.join('');
    return normalizeOutput(raw);
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = [];
  }
}
