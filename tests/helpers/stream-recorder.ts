import { performance } from 'perf_hooks';
import { getStreamBus, type StreamEvent } from '@interpreter/eval/pipeline/stream-bus';

type ChunkEvent = Extract<StreamEvent, { type: 'CHUNK' }>;

export interface RecordedEvent extends StreamEvent {
  receivedAt: number;
}

export interface StreamRecorder {
  events: RecordedEvent[];
  stop(): void;
  getChunks(): Array<ChunkEvent & { receivedAt: number }>;
  getChunkTimes(): number[];
}

export function startStreamRecorder(): StreamRecorder {
  const bus = getStreamBus();
  const events: RecordedEvent[] = [];
  const start = performance.now();
  const unsubscribe = bus.subscribe(event => {
    events.push({
      ...event,
      receivedAt: performance.now() - start
    });
  });

  return {
    events,
    stop: () => unsubscribe(),
    getChunks: () =>
      events.filter(
        (e): e is ChunkEvent & { receivedAt: number } => e.type === 'CHUNK'
      ),
    getChunkTimes: () =>
      events
        .filter((e): e is ChunkEvent & { receivedAt: number } => e.type === 'CHUNK')
        .map(e => e.receivedAt)
  };
}
