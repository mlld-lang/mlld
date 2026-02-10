import { describe, expect, it, vi } from 'vitest';
import type { StreamEvent } from '@interpreter/eval/pipeline/stream-bus';
import { SdkEventBridge } from './SdkEventBridge';

function createBusHarness() {
  const unsubscribers: Array<ReturnType<typeof vi.fn>> = [];
  const listeners: Array<(event: StreamEvent) => void> = [];
  const bus = {
    subscribe: vi.fn((listener: (event: StreamEvent) => void) => {
      listeners.push(listener);
      const unsubscribe = vi.fn(() => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      });
      unsubscribers.push(unsubscribe);
      return unsubscribe;
    })
  };

  return {
    bus,
    emit(event: StreamEvent): void {
      listeners.slice().forEach(listener => listener(event));
    },
    getUnsubscriber(index: number) {
      return unsubscribers[index];
    }
  };
}

describe('SdkEventBridge', () => {
  it('maps stream bus events to SDK stream and command events', () => {
    const bridge = new SdkEventBridge();
    const harness = createBusHarness();
    const emitter = { emit: vi.fn() };
    const timestamp = Date.now();

    bridge.setStreamingOptions({ enabled: true });
    bridge.enable(emitter as any, harness.bus as any);

    harness.emit({
      type: 'CHUNK',
      pipelineId: 'p',
      stageIndex: 0,
      chunk: 'hello',
      source: 'stdout',
      timestamp
    });
    harness.emit({
      type: 'STAGE_START',
      pipelineId: 'p',
      stageIndex: 1,
      command: { rawIdentifier: 'echo hello' },
      timestamp: timestamp + 1
    });
    harness.emit({
      type: 'STAGE_SUCCESS',
      pipelineId: 'p',
      stageIndex: 1,
      durationMs: 5,
      timestamp: timestamp + 2
    });
    harness.emit({
      type: 'STAGE_FAILURE',
      pipelineId: 'p',
      stageIndex: 2,
      error: new Error('boom'),
      timestamp: timestamp + 3
    });

    const events = emitter.emit.mock.calls.map(([event]) => event);
    expect(events.some((event: any) => event.type === 'stream:chunk')).toBe(true);
    expect(events.some((event: any) => event.type === 'command:start')).toBe(true);
    expect(events.some((event: any) => event.type === 'command:complete' && event.error === undefined)).toBe(true);
    expect(
      events.some((event: any) => event.type === 'command:complete' && event.error instanceof Error)
    ).toBe(true);
  });

  it('suppresses chunk stream events when streaming is disabled', () => {
    const bridge = new SdkEventBridge();
    const harness = createBusHarness();
    const emitter = { emit: vi.fn() };

    bridge.setStreamingOptions({ enabled: false });
    bridge.enable(emitter as any, harness.bus as any);

    harness.emit({
      type: 'CHUNK',
      pipelineId: 'p',
      stageIndex: 0,
      chunk: 'hidden',
      source: 'stdout',
      timestamp: Date.now()
    });

    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('replaces stream subscriptions when re-enabled and cleans up emitter state', () => {
    const bridge = new SdkEventBridge();
    const firstHarness = createBusHarness();
    const secondHarness = createBusHarness();
    const emitter = { emit: vi.fn() };

    bridge.enable(emitter as any, firstHarness.bus as any);
    bridge.enable(emitter as any, secondHarness.bus as any);

    expect(firstHarness.getUnsubscriber(0)).toHaveBeenCalledTimes(1);
    expect(bridge.hasEmitter()).toBe(true);

    bridge.cleanup();
    expect(secondHarness.getUnsubscriber(0)).toHaveBeenCalledTimes(1);
    expect(bridge.hasEmitter()).toBe(false);

    secondHarness.emit({
      type: 'STAGE_START',
      pipelineId: 'p',
      stageIndex: 0,
      timestamp: Date.now()
    });
    expect(emitter.emit).toHaveBeenCalledTimes(0);
  });
});
