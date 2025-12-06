import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { interpret } from '@interpreter/index';
import type { StreamExecution as StreamHandle } from '@sdk/types';
import { ExecutionEmitter } from '@sdk/execution-emitter';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';

describe('StreamExecution', () => {
  const fileSystem = new MemoryFileSystem();
  const pathService = new PathService();
  let manager: StreamingManager;

  beforeEach(() => {
    manager = new StreamingManager();
  });

  afterEach(() => {
    manager.getBus().clear();
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
      streaming: { enabled: false },
      streamingManager: manager
    })) as StreamHandle;

    await handle.done();
    const result = await handle.result();

    expect(handle.isComplete()).toBe(true);
    expect(result.output).toContain('hi');
    const effectEvent = events.find(e => e.type === 'effect');
    expect(effectEvent).toBeDefined();
    expect(effectEvent.effect.security).toBeDefined();
    expect(Array.isArray(effectEvent.effect.security.labels)).toBe(true);
    expect(Array.isArray(effectEvent.effect.security.taint)).toBe(true);
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
      streaming: { enabled: true },
      streamingManager: manager
    });

    const bus = manager.getBus();
    const ts = Date.now();
    bus.emit({ type: 'STAGE_START', pipelineId: 'p', stageIndex: 0, timestamp: ts });
    bus.emit({ type: 'STAGE_SUCCESS', pipelineId: 'p', stageIndex: 0, durationMs: 1, timestamp: ts + 1 });

    expect(events.some(e => e.type === 'command:start')).toBe(true);
    expect(events.some(e => e.type === 'command:complete')).toBe(true);
  });

  it('emits streaming events from format adapter to SDK emitter', async () => {
    const emitter = new ExecutionEmitter();
    const events: any[] = [];
    emitter.on('streaming:message', e => events.push(e));

    const env = new Environment(fileSystem, pathService, {
      projectRoot: '/',
      fileDirectory: '/',
      executionDirectory: '/',
      invocationDirectory: '/'
    });
    env.enableSDKEvents(emitter);

    const manager = env.getStreamingManager();
    const adapter = await (await import('@interpreter/streaming/adapter-registry')).getAdapter('claude-code');
    manager.configure({
      env,
      streamingEnabled: true,
      streamingOptions: env.getStreamingOptions(),
      adapter: adapter as any
    });

    const bus = manager.getBus();
    bus.emit({
      type: 'CHUNK',
      pipelineId: 'p',
      stageIndex: 0,
      chunk: '{"type":"text","text":"Hello"}\n',
      source: 'stdout',
      timestamp: Date.now()
    });
    manager.finalizeResults();

    expect(events.some(e => e.chunk === 'Hello')).toBe(true);
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

    const bus = manager.getBus();

    const handle = (await interpret('/show \"hi\"', {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'stream',
      emitter,
      streaming: { enabled: true },
      streamingManager: manager
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

    const bus = manager.getBus();

    const handle = (await interpret('/show \"hi\"', {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'stream',
      emitter,
      streaming: { enabled: false },
      streamingManager: manager
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
