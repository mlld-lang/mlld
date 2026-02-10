import type { ExecutionEmitter } from '@sdk/execution-emitter';
import type { SDKEvent, SDKStreamEvent, SDKCommandEvent } from '@sdk/types';
import type { StreamBus, StreamEvent } from '@interpreter/eval/pipeline/stream-bus';
import { defaultStreamingOptions, type StreamingOptions } from '@interpreter/eval/pipeline/streaming-options';

export class SdkEventBridge {
  private emitter?: ExecutionEmitter;
  private unsubscribe?: () => void;
  private streamingOptions: StreamingOptions = { ...defaultStreamingOptions };

  hasEmitter(): boolean {
    return this.emitter !== undefined;
  }

  setStreamingOptions(options: StreamingOptions): void {
    this.streamingOptions = { ...options };
  }

  enable(emitter: ExecutionEmitter, bus: StreamBus): void {
    this.emitter = emitter;
    this.cleanupSubscription();

    this.unsubscribe = bus.subscribe(event => {
      this.emitMappedEvents(event);
    });
  }

  emit(event: SDKEvent): void {
    this.emitter?.emit(event);
  }

  cleanup(): void {
    this.cleanupSubscription();
    this.emitter = undefined;
  }

  private emitMappedEvents(event: StreamEvent): void {
    const streamEvent = this.mapStreamEvent(event);
    if (streamEvent) {
      this.emitter?.emit(streamEvent);
    }

    const commandEvent = this.mapCommandEvent(event);
    if (commandEvent) {
      this.emitter?.emit(commandEvent);
    }
  }

  private cleanupSubscription(): void {
    if (!this.unsubscribe) {
      return;
    }
    try {
      this.unsubscribe();
    } finally {
      this.unsubscribe = undefined;
    }
  }

  private mapStreamEvent(event: StreamEvent): SDKStreamEvent | null {
    const streamingSuppressed = this.streamingOptions.enabled === false;
    if (streamingSuppressed && event.type === 'CHUNK') {
      return null;
    }
    if (event.type === 'CHUNK') {
      return { type: 'stream:chunk', event };
    }
    return { type: 'stream:progress', event };
  }

  private mapCommandEvent(event: StreamEvent): SDKCommandEvent | null {
    switch (event.type) {
      case 'STAGE_START':
        return {
          type: 'command:start',
          command: (event.command as any)?.rawIdentifier,
          stageIndex: event.stageIndex,
          parallelIndex: event.parallelIndex,
          pipelineId: event.pipelineId,
          timestamp: event.timestamp
        };
      case 'STAGE_SUCCESS':
        return {
          type: 'command:complete',
          stageIndex: event.stageIndex,
          parallelIndex: event.parallelIndex,
          pipelineId: event.pipelineId,
          durationMs: event.durationMs,
          timestamp: event.timestamp
        };
      case 'STAGE_FAILURE':
        return {
          type: 'command:complete',
          stageIndex: event.stageIndex,
          parallelIndex: event.parallelIndex,
          pipelineId: event.pipelineId,
          error: event.error,
          timestamp: event.timestamp
        };
      default:
        return null;
    }
  }
}
