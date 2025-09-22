import type { StreamEvent } from '../pipeline/stream-bus';

export interface StreamSink {
  attach(): void;
  detach(): void;
}

export interface EventAwareSink extends StreamSink {
  onEvent(event: StreamEvent): void;
}

