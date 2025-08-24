import chalk from 'chalk';
import { getStreamBus, type StreamEvent } from '../stream-bus';

export class ProgressOnlySink {
  private unsubscribe: (() => void) | null = null;
  private stageWords: Map<number, number> = new Map();
  private stageLabels: Map<number, string> = new Map();

  attach(): void {
    if (this.unsubscribe) return;
    const bus = getStreamBus();
    this.unsubscribe = bus.subscribe((e) => this.onEvent(e));
  }

  detach(): void {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
  }

  private onEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'STAGE_START': {
        const label = this.friendlyLabel(event.commandId || `stage-${event.stage + 1}`);
        this.stageLabels.set(event.stage, label);
        this.stageWords.set(event.stage, 0);
        this.render(event.stage);
        break;
      }
      case 'STAGE_SUCCESS': {
        const words = event.words ?? this.countWords(event.outputPreview || '');
        this.stageWords.set(event.stage, words);
        this.render(event.stage);
        break;
      }
      case 'STAGE_RETRY_REQUEST': {
        // Reset counters for target stage
        this.stageWords.set(event.targetStage, 0);
        this.render(event.targetStage);
        break;
      }
      case 'PIPELINE_COMPLETE': {
        this.done();
        break;
      }
      case 'PIPELINE_ABORT': {
        this.done();
        break;
      }
    }
  }

  private countWords(text: string): number {
    const t = text.trim();
    if (!t) return 0;
    return t.split(/\s+/).length;
  }

  private friendlyLabel(raw: string): string {
    const max = 30;
    const base = raw || '';
    return base.length > max ? base.slice(0, max - 1) + '…' : base;
  }

  private render(stage: number): void {
    const label = this.stageLabels.get(stage) || `stage-${stage + 1}`;
    const words = this.stageWords.get(stage) || 0;
    const colored = process.stderr.isTTY ? chalk.cyan(label) : label;
    const line = `stage ${stage + 1}: ${colored} — ${words} words`;
    if (process.stderr.isTTY) {
      process.stderr.write('\r' + line);
    } else {
      process.stderr.write(line + '\n');
    }
  }

  private done(): void {
    if (process.stderr.isTTY) process.stderr.write('\n');
  }
}

