import type { StreamEvent } from '../stream-bus';

export interface StreamSink {
  handle(event: StreamEvent): void;
  stop?(): void;
}

export interface ProgressSinkOptions {
  useTTY?: boolean;
  label?: string;
  writer?: NodeJS.WriteStream;
}
