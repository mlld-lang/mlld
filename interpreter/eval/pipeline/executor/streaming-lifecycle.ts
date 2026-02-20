import type { PipelineStage, PipelineStageEntry } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { StreamEvent } from '@interpreter/eval/pipeline/stream-bus';
import type { StreamingOptions } from '@interpreter/eval/pipeline/streaming-options';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';

type StreamEventInput = Omit<StreamEvent, 'timestamp' | 'pipelineId'> & {
  timestamp?: number;
  pipelineId?: string;
};

export class PipelineStreamingLifecycle {
  private readonly streamingOptions: StreamingOptions;
  private readonly streamingEnabled: boolean;
  private readonly streamingManager: StreamingManager;
  private readonly pipelineId: string;
  private readonly pipeline: PipelineStage[];

  constructor(
    pipeline: PipelineStage[],
    env: Environment,
    pipelineId: string,
    streamingManager?: StreamingManager
  ) {
    this.pipeline = pipeline;
    this.pipelineId = pipelineId;
    this.streamingOptions = env.getStreamingOptions();
    this.streamingEnabled =
      this.streamingOptions.enabled !== false &&
      this.pipelineHasStreamingStage(pipeline);
    this.streamingManager = streamingManager ?? env.getStreamingManager();

    if (this.streamingEnabled && !this.streamingOptions.skipDefaultSinks) {
      this.streamingManager.configure({
        env,
        streamingEnabled: true,
        streamingOptions: this.streamingOptions
      });
    }
  }

  isEnabled(): boolean {
    return this.streamingEnabled;
  }

  isStageExecutionStreaming(stage: PipelineStageEntry | PipelineStageEntry[]): boolean {
    return this.streamingEnabled && this.isStageStreaming(stage);
  }

  emit(event: StreamEventInput): void {
    if (!this.streamingEnabled) {
      return;
    }
    this.streamingManager.getBus().emit({
      ...event,
      pipelineId: event.pipelineId || this.pipelineId,
      timestamp: event.timestamp ?? Date.now()
    } as StreamEvent);
  }

  teardown(): void {
    if (!this.streamingEnabled || this.streamingOptions.skipDefaultSinks) {
      return;
    }
    try {
      this.streamingManager.teardown();
    } catch {
      // ignore teardown errors
    }
  }

  private isStageStreaming(stage: PipelineStageEntry | PipelineStageEntry[]): boolean {
    if (Array.isArray(stage)) {
      return stage.some(subStage => this.isStageStreaming(subStage));
    }
    const candidate = stage as any;
    return Boolean(
      candidate?.stream ||
      candidate?.withClause?.stream ||
      candidate?.meta?.withClause?.stream
    );
  }

  private pipelineHasStreamingStage(pipeline: PipelineStage[]): boolean {
    return pipeline.some(stage => this.isStageStreaming(stage));
  }
}
