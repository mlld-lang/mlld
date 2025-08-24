import { getStreamBus, type StreamEvent } from '../stream-bus';

export class TerminalSink {
  private unsubscribe: (() => void) | null = null;
  private dest: 'stdout'|'stderr'|'auto';

  constructor(dest: 'stdout'|'stderr'|'auto' = 'auto') {
    this.dest = dest;
  }

  attach(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = getStreamBus().subscribe((e) => this.onEvent(e));
  }

  detach(): void {
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = null;
  }

  private onEvent(event: StreamEvent): void {
    if (event.type === 'CHUNK') {
      const stream = this.chooseStream(event.source);
      stream.write(event.text);
    }
  }

  private chooseStream(source: 'stdout'|'stderr'|'api') {
    if (this.dest === 'stdout') return process.stdout;
    if (this.dest === 'stderr') return process.stderr;
    // auto: stdout for stdout/api, stderr for stderr
    return source === 'stderr' ? process.stderr : process.stdout;
  }
}

