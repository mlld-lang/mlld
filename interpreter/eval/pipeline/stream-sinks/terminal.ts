import type { StreamEvent } from '../stream-bus';
import type { StreamSink } from './interfaces';

export type TerminalDestination = 'stdout' | 'stderr' | 'auto';

interface TerminalSinkOptions {
  destination?: TerminalDestination;
}

/**
 * TerminalSink forwards streaming chunks to stdout or stderr.
 */
export class TerminalSink implements StreamSink {
  private destination: TerminalDestination;

  constructor(options?: TerminalSinkOptions) {
    this.destination = options?.destination || 'auto';
  }

  handle(event: StreamEvent): void {
    if (event.type !== 'CHUNK') return;

    const dest = this.resolveDestination(event);
    dest.write(event.chunk);
  }

  private resolveDestination(event: StreamEvent): NodeJS.WriteStream {
    if (this.destination === 'stdout') return process.stdout;
    if (this.destination === 'stderr') return process.stderr;
    return event.source === 'stderr' ? process.stderr : process.stdout;
  }
}
