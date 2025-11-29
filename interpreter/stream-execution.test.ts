import { describe, it, expect, afterEach } from 'vitest';
import { interpret } from '@interpreter/index';
import type { StreamExecution as StreamHandle } from '@sdk/types';
import { ExecutionEmitter } from '@sdk/execution-emitter';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { getStreamBus } from '@interpreter/eval/pipeline/stream-bus';
import { Environment } from '@interpreter/env/Environment';

describe('StreamExecution', () => {
  const fileSystem = new MemoryFileSystem();
  const pathService = new PathService();

  afterEach(() => {
    getStreamBus().clear();
  });

  it('resolves handle result and emits effect + execution events', async () => {
    const emitter = new ExecutionEmitter();
    const events: any[] = [];
    emitter.on('effect', e => events.push(e));
    emitter.on('execution:complete', e => events.push(e));

    const handle = (await interpret('/show "hi"', {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'stream',
      emitter,
      streaming: { enabled: false }
    })) as StreamHandle;

    await handle.done();
    const result = await handle.result();

    expect(handle.isComplete()).toBe(true);
    expect(result.output).toContain('hi');
    const effectEvent = events.find(e => e.type === 'effect');
    expect(effectEvent).toBeDefined();
    expect(effectEvent.effect.security).toBeDefined();
    expect(Array.isArray(effectEvent.effect.security.labels)).toBe(true);
    expect(effectEvent.effect.security.taintLevel).toBeDefined();
    expect(Array.isArray(effectEvent.effect.security.sources)).toBe(true);
    expect(events.some(e => e.type === 'execution:complete')).toBe(true);
  });

  it('bridges command events from StreamBus', async () => {
    const emitter = new ExecutionEmitter();
    const events: any[] = [];
    emitter.on('command:start', e => events.push(e));
    emitter.on('command:complete', e => events.push(e));

    await interpret('/show "noop"', {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'stream',
      emitter,
      streaming: { enabled: true }
    });

    const bus = getStreamBus();
    const ts = Date.now();
    bus.emit({ type: 'STAGE_START', pipelineId: 'p', stageIndex: 0, timestamp: ts });
    bus.emit({ type: 'STAGE_SUCCESS', pipelineId: 'p', stageIndex: 0, durationMs: 1, timestamp: ts + 1 });

    expect(events.some(e => e.type === 'command:start')).toBe(true);
    expect(events.some(e => e.type === 'command:complete')).toBe(true);
  });

  it('inherits emitter in child environments', () => {
    const emitter = new ExecutionEmitter();
    const received: any[] = [];
    emitter.on('effect', e => received.push(e));

    const pathContext = {
      projectRoot: '/',
      fileDirectory: '/',
      executionDirectory: '/',
      invocationDirectory: '/'
    };
    const env = new Environment(fileSystem, pathService, pathContext);
    env.enableSDKEvents(emitter);
    const child = env.createChild();

    child.emitEffect('doc', 'hello');

    expect(received.length).toBeGreaterThan(0);
    expect(received[0].effect.content).toBe('hello');
  });

  it('delivers chunk events during execution (timing)', async () => {
    const emitter = new ExecutionEmitter();
    const received: any[] = [];
    emitter.on('stream:chunk', e => received.push(e));

    const bus = getStreamBus();

    const handle = (await interpret('/show \"hi\"', {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'stream',
      emitter,
      streaming: { enabled: true }
    })) as StreamHandle;

    // Emit a chunk immediately after getting the handle to simulate in-flight streaming.
    bus.emit({ type: 'CHUNK', pipelineId: 'p', stageIndex: 0, chunk: 'early', source: 'stdout', timestamp: Date.now() });

    await handle.done();

    expect(received.some(e => e.event.chunk === 'early')).toBe(true);
  });

  it('suppresses chunk events when streaming is disabled', async () => {
    const emitter = new ExecutionEmitter();
    const received: any[] = [];
    emitter.on('stream:chunk', e => received.push(e));

    const bus = getStreamBus();

    const handle = (await interpret('/show \"hi\"', {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'stream',
      emitter,
      streaming: { enabled: false }
    })) as StreamHandle;

    bus.emit({ type: 'CHUNK', pipelineId: 'p', stageIndex: 0, chunk: 'early', source: 'stdout', timestamp: Date.now() });

    await handle.done();

    expect(received.length).toBe(0);
  });

  it('rejects handle on execution error', async () => {
    const emitter = new ExecutionEmitter();
    const handle = (await interpret(
      `
/exe @boom() = js { throw new Error('boom') }
/show @boom()
      `.trim(),
      {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'stream',
      emitter,
      streaming: { enabled: true }
    })) as StreamHandle;

    await expect(handle.result()).rejects.toThrow();
    await expect(handle.done()).rejects.toThrow();
  });

  it('aborts stream execution via handle.abort()', async () => {
    const emitter = new ExecutionEmitter();
    const handle = (await interpret('/show \"hi\"', {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'stream',
      emitter,
      streaming: { enabled: true }
    })) as StreamHandle;

    handle.abort?.();
    await expect(handle.result()).rejects.toThrow(/aborted/i);
    await expect(handle.done()).rejects.toThrow(/aborted/i);
  });
});
