import { getStreamBus, type StreamEvent } from '../stream-bus';
import type { EventAwareSink } from './interfaces';

// Buffering sink: collects per-stage content for later retrieval.
// Phase 0: not wired into executor; provided for future use.
export class BufferingSink implements EventAwareSink {
  private unsubscribe: (() => void) | null = null;
  private buffers: Map<number, string> = new Map();

  attach(): void {
    if (this.unsubscribe) return;
    const bus = getStreamBus();
    this.unsubscribe = bus.subscribe((e) => this.onEvent(e));
  }

  detach(): void {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
    this.buffers.clear();
  }

  onEvent(event: StreamEvent): void {
    if (event.type === 'CHUNK') {
      const prev = this.buffers.get(event.stage) || '';
      this.buffers.set(event.stage, prev + event.text);
    } else if (event.type === 'STAGE_SUCCESS') {
      // no-op for now
    }
  }

  getStageOutput(stage: number): string {
    return this.buffers.get(stage) || '';
  }
}

