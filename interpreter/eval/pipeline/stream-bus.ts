import type { PipelineStageEntry } from '@core/types';

export type StreamEvent =
  | {
      type: 'PIPELINE_START';
      pipelineId: string;
      source?: string;
      timestamp: number;
    }
  | {
      type: 'PIPELINE_COMPLETE';
      pipelineId: string;
      timestamp: number;
    }
  | {
      type: 'PIPELINE_ABORT';
      pipelineId: string;
      reason: string;
      timestamp: number;
    }
  | {
      type: 'STAGE_START';
      pipelineId: string;
      stageIndex: number;
      command?: PipelineStageEntry;
      contextId?: string;
      attempt?: number;
      timestamp: number;
    }
  | {
      type: 'STAGE_SUCCESS';
      pipelineId: string;
      stageIndex: number;
      durationMs: number;
      timestamp: number;
    }
  | {
      type: 'STAGE_FAILURE';
      pipelineId: string;
      stageIndex: number;
      error: Error;
      timestamp: number;
    }
  | {
      type: 'CHUNK';
      pipelineId: string;
      stageIndex: number;
      chunk: string;
      source: 'stdout' | 'stderr';
      timestamp: number;
    };

export type StreamListener = (event: StreamEvent) => void;

class StreamBus {
  private listeners: Set<StreamListener> = new Set();

  subscribe(listener: StreamListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: StreamEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[StreamBus] Listener error', error);
        }
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

let singleton: StreamBus | null = null;

export function getStreamBus(): StreamBus {
  if (!singleton) {
    singleton = new StreamBus();
  }
  return singleton;
}
