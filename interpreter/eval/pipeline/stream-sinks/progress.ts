import type { StreamEvent } from '../stream-bus';
import type { ProgressSinkOptions, StreamSink } from './interfaces';

interface StageProgress {
  tokens: number;
  startedAt: number;
  lastRendered: string;
}

function countTokens(text: string): number {
  if (!text) return 0;
  return text
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean).length;
}

/**
 * ProgressOnlySink renders terse token counts for each stage.
 * It tracks chunks and finalizes lines on success or failure.
 */
export class ProgressOnlySink implements StreamSink {
  private options: ProgressSinkOptions;
  private stages: Map<number, StageProgress> = new Map();
  private pipelineId?: string;
  private writer: NodeJS.WriteStream;
  private useTTY: boolean;

  constructor(options?: ProgressSinkOptions) {
    this.options = options || {};
    this.writer = this.options.writer || process.stderr;
    this.useTTY = this.options.useTTY ?? this.writer.isTTY ?? false;
  }

  handle(event: StreamEvent): void {
    this.pipelineId = this.pipelineId || event.pipelineId;
    switch (event.type) {
      case 'STAGE_START':
        this.stages.set(event.stageIndex, {
          tokens: 0,
          startedAt: Date.now(),
          lastRendered: ''
        });
        this.render(event.stageIndex);
        break;

      case 'CHUNK': {
        const current = this.stages.get(event.stageIndex);
        if (!current) break;
        current.tokens += countTokens(event.chunk);
        this.render(event.stageIndex);
        break;
      }

      case 'STAGE_SUCCESS':
      case 'STAGE_FAILURE': {
        this.render(event.stageIndex, true);
        this.stages.delete(event.stageIndex);
        break;
      }

      case 'PIPELINE_COMPLETE':
      case 'PIPELINE_ABORT':
        this.flush();
        break;
    }
  }

  stop(): void {
    this.flush();
  }

  private render(stageIndex: number, done: boolean = false): void {
    const info = this.stages.get(stageIndex);
    if (!info) return;
    const label = this.options.label ? `${this.options.label} ` : '';
    const tokensText = `${info.tokens} tokens`;
    const line = `⟳ ${label}stage ${stageIndex + 1}: ${tokensText}`;

    const suffix = done ? '\n' : '';
    if (this.useTTY) {
      this.writer.write(`\r${line}${suffix}`);
    } else {
      if (done || line !== info.lastRendered) {
        this.writer.write(`${line}${suffix}`);
      }
    }
    info.lastRendered = line;
  }

  private flush(): void {
    for (const [stage] of this.stages) {
      this.render(stage, true);
    }
    this.stages.clear();
  }
}
