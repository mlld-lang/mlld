import { describe, it, expect } from 'vitest';
import { getStreamBus, type StreamEvent } from './stream-bus';

describe('stream-bus', () => {
  it('publishes to subscribers in order and supports unsubscribe', () => {
    const bus = getStreamBus();
    const received: StreamEvent[] = [];
    const unsub = bus.subscribe((e) => received.push(e));

    const e1: StreamEvent = { type: 'PIPELINE_START', input: 'x' };
    const e2: StreamEvent = { type: 'STAGE_START', stage: 1 };
    bus.publish(e1);
    bus.publish(e2);

    expect(received.length).toBe(2);
    expect(received[0]).toBe(e1);
    expect(received[1]).toBe(e2);

    unsub();
    bus.publish({ type: 'PIPELINE_COMPLETE', output: 'ok' });
    expect(received.length).toBe(2);
  });
});

