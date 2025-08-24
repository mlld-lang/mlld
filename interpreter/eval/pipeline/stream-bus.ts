// Minimal streaming event bus (Phase 0 scaffolding)
// Provides a typed pub/sub for pipeline and executor events.

export type StreamSource = 'stdout' | 'stderr' | 'api';

export type PipelineStartEvent = {
  type: 'PIPELINE_START';
  input: string;
};

export type StageStartEvent = {
  type: 'STAGE_START';
  stage: number;
  attempt?: number;
  commandId?: string;
};

export type ChunkEvent = {
  type: 'CHUNK';
  stage: number;
  source: StreamSource;
  text: string;
  attempt?: number;
  commandId?: string;
};

export type StageSuccessEvent = {
  type: 'STAGE_SUCCESS';
  stage: number;
  outputPreview?: string;
  bytes?: number;
  words?: number;
  attempt?: number;
};

export type StageRetryEvent = {
  type: 'STAGE_RETRY_REQUEST';
  requestingStage: number;
  targetStage: number;
  contextId: string;
};

export type StageFailureEvent = {
  type: 'STAGE_FAILURE';
  stage: number;
  error: Error;
};

export type PipelineCompleteEvent = {
  type: 'PIPELINE_COMPLETE';
  output: string;
};

export type PipelineAbortEvent = {
  type: 'PIPELINE_ABORT';
  reason: string;
};

export type StreamEvent =
  | PipelineStartEvent
  | StageStartEvent
  | ChunkEvent
  | StageSuccessEvent
  | StageRetryEvent
  | StageFailureEvent
  | PipelineCompleteEvent
  | PipelineAbortEvent;

export type StreamHandler = (event: StreamEvent) => void;

class StreamBus {
  private handlers: Set<StreamHandler> = new Set();

  subscribe(handler: StreamHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  publish(event: StreamEvent): void {
    // Copy handlers to avoid mutation during iteration
    for (const h of Array.from(this.handlers)) {
      try {
        h(event);
      } catch {
        // Non-fatal; keep bus resilient
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

// Singleton accessor
let busInstance: StreamBus | null = null;

export function getStreamBus(): StreamBus {
  if (!busInstance) busInstance = new StreamBus();
  return busInstance;
}

