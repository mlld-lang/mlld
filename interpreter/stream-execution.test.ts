import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { interpret } from '@interpreter/index';
import type { StreamExecution as StreamHandle } from '@sdk/types';
import { ExecutionEmitter } from '@sdk/execution-emitter';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { Environment } from '@interpreter/env/Environment';
import { StreamingManager } from '@interpreter/streaming/streaming-manager';
import {
  createGuardSessionWriteBuffer,
  createSessionAccessorVariable,
  disposeSessionFrame,
  materializeSession
} from '@interpreter/session/runtime';
import { fileURLToPath } from 'url';

const callToolFromConfigPath = fileURLToPath(
  new URL('../tests/support/mcp/call-tool-from-config.cjs', import.meta.url)
);

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

  it('emits guard_denial events before rejecting unhandled guarded execution', async () => {
    const emitter = new ExecutionEmitter();
    const denials: any[] = [];
    emitter.on('guard_denial', event => denials.push(event));

    const handle = (await interpret(
      `
/guard @blocker before op:exe = when [
  @mx.op.name == "danger" => deny "blocked by policy"
  * => allow
]
/exe @danger(value) = \`danger: @value\`
/show @danger("hello")
      `.trim(),
      {
        fileSystem,
        pathService,
        basePath: '/',
        mode: 'stream',
        emitter,
        streaming: { enabled: true }
      }
    )) as StreamHandle;

    await expect(handle.result()).rejects.toThrow(/blocked by policy/i);
    await expect(handle.done()).rejects.toThrow(/blocked by policy/i);
    expect(denials).toEqual([
      expect.objectContaining({
        type: 'guard_denial',
        guard_denial: expect.objectContaining({
          guard: 'blocker',
          operation: 'danger',
          reason: 'blocked by policy',
          args: { value: 'hello' }
        })
      })
    ]);
  });

  it('emits session_write events for attached session mutations', async () => {
    const emitter = new ExecutionEmitter();
    const writes: any[] = [];
    emitter.on('session_write', event => writes.push(event));

    const handle = (await interpret(
      [
        '/var session @planner = {',
        '  count: number?',
        '}',
        '/exe tool:w @track() = [',
        '  @planner.increment("count")',
        '  => @planner.count',
        ']',
        '/var @toolList = [@track]',
        `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
        '/var @result = @agent("hello", { tools: @toolList }) with { session: @planner }'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        basePath: '/',
        mode: 'stream',
        emitter,
        streaming: { enabled: false }
      }
    )) as StreamHandle;

    await handle.done();
    await handle.result();

    expect(writes).toEqual([
      expect.objectContaining({
        type: 'session_write',
        session_write: expect.objectContaining({
          session_name: 'planner',
          slot_path: 'count',
          operation: 'increment',
          next: 1
        })
      })
    ]);
  });

  it('does not emit session_write events for writes discarded by a denying guard', async () => {
    const emitter = new ExecutionEmitter();
    const writes: any[] = [];
    emitter.on('session_write', event => writes.push(event));

    const handle = (await interpret(
      [
        '/guard @block before tool:w = when [',
        '  * => deny "blocked"',
        ']',
        '/var session @planner = {',
        '  count: number?',
        '}',
        '/exe tool:w @track() = [',
        '  @planner.increment("count")',
        '  => @planner.count',
        ']',
        '/var @toolList = [@track]',
        `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
        '/var @result = @agent("hello", { tools: @toolList }) with {',
        '  session: @planner,',
        '  seed: { count: 1 }',
        '}'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        basePath: '/',
        mode: 'stream',
        emitter,
        streaming: { enabled: false }
      }
    )) as StreamHandle;

    await expect(handle.result()).rejects.toThrow(/blocked/i);
    await expect(handle.done()).rejects.toThrow(/blocked/i);

    expect(writes).toEqual([
      expect.objectContaining({
        type: 'session_write',
        session_write: expect.objectContaining({
          session_name: 'planner',
          slot_path: 'count',
          operation: 'seed',
          next: 1
        })
      })
    ]);
    expect(writes).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          session_write: expect.objectContaining({
            operation: 'increment'
          })
        })
      ])
    );
  });

  it('drops buffered session traces and SDK events when a guard session buffer is discarded', async () => {
    const emitter = new ExecutionEmitter();
    const writes: any[] = [];
    emitter.on('session_write', event => writes.push(event));
    let capturedEnv: Environment | undefined;

    await interpret(
      [
        '/var session @planner = {',
        '  count: number?',
        '}'
      ].join('\n'),
      {
        fileSystem,
        pathService,
        basePath: '/',
        mode: 'structured',
        trace: 'effects',
        emitter,
        captureEnvironment: env => {
          capturedEnv = env;
        }
      }
    );

    expect(capturedEnv).toBeDefined();
    capturedEnv!.enableSDKEvents(emitter);
    capturedEnv!.setRuntimeTrace('effects');

    const definition = capturedEnv!.getSessionDefinition('planner');
    expect(definition).toBeDefined();

    const sessionId = 'guard-buffer-session';
    capturedEnv!.setLlmToolConfig({ sessionId } as any);
    const instance = materializeSession(definition!, capturedEnv!, sessionId);
    instance.setSlot('count', 0);
    instance.setTraceSlot('count', 0);
    capturedEnv!.attachSessionInstance(sessionId, instance);

    const accessor = createSessionAccessorVariable('planner', definition!, capturedEnv!);
    const incrementMethod = (accessor.value as Record<string, any>).increment;
    const incrementExecutable = incrementMethod?.internal?.executableDef;
    expect(incrementExecutable).toBeDefined();

    const sessionWriteBuffer = createGuardSessionWriteBuffer();
    capturedEnv!.pushSessionWriteBuffer(sessionWriteBuffer);
    await incrementExecutable!.fn('count', capturedEnv!);
    sessionWriteBuffer.discard();
    capturedEnv!.popSessionWriteBuffer(sessionWriteBuffer);

    disposeSessionFrame(sessionId, capturedEnv!);

    expect(writes).toEqual([]);
    expect(capturedEnv?.getSessionWrites()).toEqual([]);
    expect(capturedEnv?.getRuntimeTraceEvents().filter(event => event.category === 'session')).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ event: 'session.write' })
      ])
    );
    expect(capturedEnv?.getCompletedSessions()).toEqual([
      expect.objectContaining({
        name: 'planner',
        finalState: { count: 0 }
      })
    ]);
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
