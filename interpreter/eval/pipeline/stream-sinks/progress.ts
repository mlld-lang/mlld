import chalk from 'chalk';
import { getStreamBus, type StreamEvent } from '../stream-bus';

export class ProgressOnlySink {
  private unsubscribe: (() => void) | null = null;
  private stageWords: Map<number, number> = new Map();
  private stageLabels: Map<number, string> = new Map();
  private carry: Map<number, string> = new Map();
  private lastRenderAt: Map<number, number> = new Map();

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
        this.carry.set(event.stage, '');
        this.render(event.stage);
        break;
      }
      case 'CHUNK': {
        // Increment words carryover-safe across chunks
        const stage = event.stage;
        const prior = this.carry.get(stage) || '';
        const text = prior + this.stripAnsi(event.text || '');
        if (text.length > 0) {
          // Split on whitespace; last token may be incomplete
          const parts = text.split(/\s+/);
          const endsWithSpace = /\s$/.test(text);
          const completeTokens = endsWithSpace ? parts.filter(Boolean) : parts.slice(0, -1).filter(Boolean);
          if (completeTokens.length > 0) {
            const current = this.stageWords.get(stage) || 0;
            this.stageWords.set(stage, current + completeTokens.length);
          }
          const newCarry = endsWithSpace ? '' : (parts[parts.length - 1] || '');
          this.carry.set(stage, newCarry);
        }
        this.render(stage, true);
        break;
      }
      case 'STAGE_SUCCESS': {
        const words = event.words ?? this.countWords(event.outputPreview || '');
        // Flush any pending carry as one word if present
        const pending = this.carry.get(event.stage) || '';
        const add = words + (pending.trim().length > 0 ? 1 : 0);
        const current = this.stageWords.get(event.stage) || 0;
        this.stageWords.set(event.stage, current + add);
        this.carry.set(event.stage, '');
        this.render(event.stage);
        break;
      }
      case 'STAGE_RETRY_REQUEST': {
        // Reset counters for target stage
        this.stageWords.set(event.targetStage, 0);
        this.carry.set(event.targetStage, '');
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

  private render(stage: number, isProgressUpdate: boolean = false): void {
    const label = this.stageLabels.get(stage) || `stage-${stage + 1}`;
    const words = this.stageWords.get(stage) || 0;
    const colored = process.stderr.isTTY ? chalk.cyan(label) : label;
    const line = `stage ${stage + 1}: ${colored} — ${words} words`;
    if (process.stderr.isTTY) {
      // Debounce/throttle progress updates lightly in TTY to avoid flicker
      if (isProgressUpdate) {
        const now = Date.now();
        const last = this.lastRenderAt.get(stage) || 0;
        if (now - last < 80) return; // ~12.5fps throttle
        this.lastRenderAt.set(stage, now);
      }
      process.stderr.write('\r' + line);
    } else {
      process.stderr.write(line + '\n');
    }
  }

  private done(): void {
    if (process.stderr.isTTY) process.stderr.write('\n');
  }

  private stripAnsi(input: string): string {
    // Basic ANSI escape removal
    return input.replace(/\u001B\[[0-?]*[ -\/]*[@-~]/g, '');
  }
}
