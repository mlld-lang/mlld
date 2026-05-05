import { describe, expect, it, vi } from 'vitest';
import { interpret } from '@interpreter/index';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { accessFields } from '@interpreter/utils/field-access';
import {
  asText,
  getRecordProjectionMetadata,
  isStructuredValue,
  setRecordProjectionMetadata,
  wrapStructured
} from '@interpreter/utils/structured-value';
import { Environment } from '@interpreter/env/Environment';
import {
  createGuardSessionWriteBuffer,
  createSessionAccessorVariable,
  disposeSessionFrame,
  materializeSession,
  snapshotSessionsForFrame
} from '@interpreter/session/runtime';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { fileURLToPath } from 'url';

const pathService = new PathService();
const callToolFromConfigPath = fileURLToPath(
  new URL('../../tests/support/mcp/call-tool-from-config.cjs', import.meta.url)
);

async function interpretWithEnv(source: string, options: Record<string, unknown> = {}): Promise<{
  result: any;
  env: Environment;
}> {
  const fileSystem = new MemoryFileSystem();
  let environment: Environment | undefined;

  const result = await interpret(source.trim(), {
    fileSystem,
    pathService,
    basePath: '/',
    mode: 'structured',
    captureEnvironment: env => {
      environment = env;
    },
    ...options
  }) as any;

  if (!environment) {
    throw new Error('Expected environment capture');
  }

  return { result, env: environment };
}

function field(value: string) {
  return { type: 'field', value } as any;
}

async function readFieldChain(env: Environment, variableName: string, fields: string[]): Promise<any> {
  const variable = env.getVariable(variableName);
  if (!variable) {
    throw new Error(`Variable @${variableName} not found`);
  }

  return accessFields(variable, fields.map(field), {
    env,
    preserveContext: false
  });
}

describe('session runtime', () => {
  it('registers session schemas with primitive and record-backed slots', async () => {
    const { env } = await interpretWithEnv([
      '/record @contact = {',
      '  facts: [email: string]',
      '}',
      '/var session @planner = {',
      '  selected: @contact?,',
      '  count: number,',
      '  log: string[]?',
      '}'
    ].join('\n'));

    const definition = env.getSessionDefinition('planner');
    expect(definition).toMatchObject({
      canonicalName: 'planner',
      slots: {
        selected: {
          name: 'selected',
          type: {
            kind: 'record',
            name: 'contact',
            optional: true,
            isArray: false
          }
        },
        count: {
          name: 'count',
          type: {
            kind: 'primitive',
            name: 'number',
            optional: false,
            isArray: false
          }
        },
        log: {
          name: 'log',
          type: {
            kind: 'primitive',
            name: 'string',
            optional: true,
            isArray: true
          }
        }
      }
    });
    expect(env.getVariable('planner')?.internal?.isSessionSchema).toBe(true);
  });

  it('supports live session writes inside tool callbacks and preserves bare-name snapshots there', async () => {
    const { result, env } = await interpretWithEnv([
      '/var session @planner = {',
      '  count: number?,',
      '  snap: number?,',
      '  log: string[]?',
      '}',
      '/exe @plusOne(value) = js {',
      '  return (value ?? 0) + 1;',
      '}',
      '/exe tool:w @track() = [',
      '  @planner.increment("count")',
      '  @planner.update("count", @plusOne)',
      '  let @snapshot = @planner',
      '  @planner.increment("count")',
      '  @planner.set({ snap: @snapshot.count })',
      '  @planner.append("log", "finish")',
      '  => @planner.count',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @result = @agent("hello", { tools: @toolList }) with { session: @planner }'
    ].join('\n'));

    const output = await extractVariableValue(env.getVariable('result')!, env);
    expect(isStructuredValue(output) ? asText(output) : output).toBe('3');
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.name).toBe('planner');
    expect(result.sessions[0]?.finalState?.count).toBe(3);
    expect(result.sessions[0]?.finalState?.log).toEqual(['finish']);
    const snap = result.sessions[0]?.finalState?.snap;
    expect(isStructuredValue(snap)).toBe(true);
    expect(isStructuredValue(snap) ? snap.data : snap).toBe(2);
  });

  it('applies session seed values to required slots before the first read', async () => {
    const { env, result } = await interpretWithEnv([
      '/var session @planner = {',
      '  query: string,',
      '  count: number',
      '}',
      '/exe llm @agent(prompt, config) = js {',
      '  return "ok";',
      '}',
      '/var @result = @agent("hello", {}) with {',
      '  session: @planner,',
      '  seed: { query: "seeded", count: 4 }',
      '}'
    ].join('\n'));

    const output = await extractVariableValue(env.getVariable('result')!, env);
    expect(isStructuredValue(output) ? asText(output) : output).toBe('ok');
    expect(result.sessions[0]?.finalState).toEqual({ query: 'seeded', count: 4 });
  });

  it('does not recursively inherit the attached session while evaluating seed helpers', async () => {
    const { env, result } = await interpretWithEnv([
      '/var session @planner = {',
      '  init: string',
      '}',
      '/exe llm @seedSource(prompt, config) = js {',
      '  return "seeded";',
      '}',
      '/exe llm @agent(prompt, config) = js {',
      '  return "ok";',
      '}',
      '/var @result = @agent("hello", {}) with {',
      '  session: @planner,',
      '  seed: { init: @seedSource("seed", {}) }',
      '}'
    ].join('\n'));

    const output = await extractVariableValue(env.getVariable('result')!, env);
    expect(isStructuredValue(output) ? asText(output) : output).toBe('ok');
    expect(result.sessions).toHaveLength(1);
    const init = result.sessions[0]?.finalState?.init;
    expect(isStructuredValue(init) ? asText(init) : init).toBe('seeded');
  });

  it('handles module-scope record output feeding a later session-seeded llm wrapper', async () => {
    const { env, result } = await interpretWithEnv([
      '/record @adviceShape = {',
      '  data: [is_advice: boolean, advice_kind: string?, why: string?],',
      '  validate: "demote"',
      '}',
      '/var session @planner = {',
      '  init: string,',
      '  mode: boolean?',
      '}',
      '/exe @classify(query) = [',
      '  let @raw = { is_advice: true, advice_kind: "hotel", why: "stubbed" }',
      '  => @raw',
      '] => record @adviceShape',
      '/exe llm @seedSource(prompt, config) = js {',
      '  return "seeded";',
      '}',
      '/exe llm @plannerProvider(prompt, config) = js {',
      '  return {',
      '    terminal: config?.adviceMode ? "blocked" : "allowed",',
      '    text: prompt',
      '  };',
      '}',
      '/exe @run(agent, query) = [',
      '  let @planned = @plannerProvider(@query, { adviceMode: @agent.adviceMode }) with {',
      '    session: @planner,',
      '    seed: { init: @seedSource("seed", {}), mode: @agent.adviceMode }',
      '  }',
      '  => @planned',
      ']',
      '/var @cls = @classify("Recommend the highest-rated hotel in Paris")',
      '/var @adviceMode = @cls.is_advice',
      '/var @agent = { adviceMode: @adviceMode }',
      '/var @runResult = @run(@agent, "trigger query")',
      '/var @summary = { adviceMode: @adviceMode, terminal: @runResult.terminal, text: @runResult.text }'
    ].join('\n'));

    const summary = await extractVariableValue(env.getVariable('summary')!, env) as any;
    expect(isStructuredValue(summary.adviceMode) ? summary.adviceMode.data : summary.adviceMode).toBe(true);
    expect(summary.terminal).toBe('blocked');
    expect(summary.text).toBe('trigger query');
    expect(result.sessions).toHaveLength(1);
    const mode = result.sessions[0]?.finalState?.mode;
    expect(isStructuredValue(mode) ? mode.data : mode).toBe(true);
    const init = result.sessions[0]?.finalState?.init;
    expect(isStructuredValue(init) ? asText(init) : init).toBe('seeded');
  });

  it('surfaces session snapshots from llm wrappers whose config is not the second parameter', async () => {
    const { env, result } = await interpretWithEnv([
      '/var session @planner = {',
      '  count: number?',
      '}',
      '/exe tool:w @track() = [',
      '  @planner.increment("count")',
      '  => @planner.count',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @inner(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/exe llm @outer(harness, prompt, config) = @inner(@prompt, @config)',
      '/var @raw = @outer("stub", "hello", { tools: @toolList }) with {',
      '  session: @planner,',
      '  seed: { count: 0 }',
      '}',
      '/var @summary = { raw: @raw, count: @raw.mx.sessions.planner.count }'
    ].join('\n'));

    const summary = await extractVariableValue(env.getVariable('summary')!, env) as any;
    expect(isStructuredValue(summary.raw) ? summary.raw.data : summary.raw).toBe('1');
    expect(isStructuredValue(summary.count) ? summary.count.data : summary.count).toBe(1);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.finalState?.count).toBe(1);
  });

  it('preserves terminal session snapshots through plain wrappers around nonstandard llm calls', async () => {
    const { env, result } = await interpretWithEnv([
      '/var session @planner = {',
      '  runtime: object?',
      '}',
      '/exe tool:w @finish() = [',
      '  @planner.set({ runtime: { terminal: { status: "complete", text: "done" } } })',
      '  => "finished"',
      ']',
      '/var @toolList = [@finish]',
      `/exe llm @inner(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" finish '{}' }`,
      '/exe llm @outer(harness, prompt, config) = @inner(@prompt, @config)',
      '/guard after for op:named:outer = when [',
      '  !@planner.runtime.terminal.isDefined() => deny "missing terminal"',
      '  * => allow',
      ']',
      '/exe @plannerCall(prompt, config) = @outer("stub", @prompt, @config) with {',
      '  session: @planner,',
      '  seed: { runtime: {} }',
      '}',
      '/var @raw = @plannerCall("hello", { tools: @toolList })',
      '/var @terminal = @raw.mx.sessions.planner.runtime.terminal'
    ].join('\n'));

    const raw = await extractVariableValue(env.getVariable('raw')!, env);
    const terminal = await extractVariableValue(env.getVariable('terminal')!, env);
    expect(isStructuredValue(raw) ? raw.data : raw).toBe('finished');
    expect(terminal).toEqual({ status: 'complete', text: 'done' });
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.finalState?.runtime).toEqual({
      terminal: { status: 'complete', text: 'done' }
    });
  });

  it('keeps sibling session-bearing wrapper calls on separate frames', async () => {
    const { env, result } = await interpretWithEnv([
      '/var session @planner = {',
      '  count: number?',
      '}',
      '/exe tool:w @track() = [',
      '  @planner.increment("count")',
      '  => @planner.count',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @inner(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/exe llm @outer(prompt, config) = @inner(@prompt, @config)',
      '/var @first = @outer("one", { tools: @toolList }) with {',
      '  session: @planner,',
      '  seed: { count: 0 }',
      '}',
      '/var @second = @outer("two", { tools: @toolList }) with {',
      '  session: @planner,',
      '  seed: { count: 10 }',
      '}',
      '/var @summary = {',
      '  first: @first.mx.sessions.planner.count,',
      '  second: @second.mx.sessions.planner.count',
      '}'
    ].join('\n'));

    const summary = await extractVariableValue(env.getVariable('summary')!, env) as any;
    expect(isStructuredValue(summary.first) ? summary.first.data : summary.first).toBe(1);
    expect(isStructuredValue(summary.second) ? summary.second.data : summary.second).toBe(11);
    expect(result.sessions.map((session: any) => session.finalState?.count)).toEqual([1, 11]);
  });

  it('exposes final session state on the returned llm value via .mx.sessions and matches ExecuteResult.sessions', async () => {
    const { env, result } = await interpretWithEnv([
      '/var session @planner = {',
      '  count: number?,',
      '  note: string?',
      '}',
      '/exe tool:w @track() = [',
      '  @planner.increment("count")',
      '  @planner.set({ note: "done" })',
      '  => "ok"',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @raw = @agent("hello", { tools: @toolList }) with { session: @planner }',
      '/var @final = @raw.mx.sessions.planner'
    ].join('\n'));

    const finalState = await extractVariableValue(env.getVariable('final')!, env);
    expect(finalState).toEqual({
      count: 1,
      note: 'done'
    });
    expect(result.sessions).toEqual([
      expect.objectContaining({
        name: 'planner',
        finalState
      })
    ]);

    const namedSessions = await readFieldChain(env, 'raw', ['mx', 'sessions']);
    expect(namedSessions).toEqual({
      planner: finalState
    });
  });

  it('releases live session frames after finalizing while preserving post-call snapshot reads', async () => {
    const { env, result } = await interpretWithEnv([
      '/var session @planner = {',
      '  count: number?,',
      '}',
      '/exe tool:w @track() = [',
      '  @planner.increment("count")',
      '  => "ok"',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @raw = @agent("hello", { tools: @toolList }) with { session: @planner }',
      '/var @final = @raw.mx.sessions.planner',
      '/var @postCallCount = @planner.count'
    ].join('\n'));

    expect(await extractVariableValue(env.getVariable('final')!, env)).toEqual({ count: 1 });
    expect(await extractVariableValue(env.getVariable('postCallCount')!, env)).toBe(1);
    expect(result.sessions[0]?.finalState).toEqual({ count: 1 });
    expect(env.getAttachedSessionFrameIds()).toEqual([]);
  });

  it('does not retain SDK session history for document-mode runs', async () => {
    const { env } = await interpretWithEnv([
      '/var session @planner = {',
      '  count: number?,',
      '}',
      '/exe tool:w @track() = [',
      '  @planner.increment("count")',
      '  => "ok"',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @raw = @agent("hello", { tools: @toolList }) with { session: @planner }',
      '/var @final = @raw.mx.sessions.planner',
      '/var @postCallCount = @planner.count'
    ].join('\n'), {
      mode: 'document'
    });

    expect(await extractVariableValue(env.getVariable('final')!, env)).toEqual({ count: 1 });
    expect(await extractVariableValue(env.getVariable('postCallCount')!, env)).toBe(1);
    expect(env.getCompletedSessions()).toEqual([]);
  });

  it('preserves labels when reading final session state through result .mx.sessions', async () => {
    const { env } = await interpretWithEnv([
      '/var session @planner = {',
      '  note: string?',
      '}',
      '/var untrusted @payload = "external request"',
      '/exe tool:w @track() = [',
      '  @planner.set({ note: @payload })',
      '  => "ok"',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @raw = @agent("hello", { tools: @toolList }) with { session: @planner }',
      '/var @labels = @raw.mx.sessions.planner.note.mx.labels'
    ].join('\n'));

    const labels = await extractVariableValue(env.getVariable('labels')!, env);
    expect(labels).toEqual(expect.arrayContaining(['untrusted']));
  });

  it('preserves factsources and projection metadata through object-style session set', async () => {
    const { env } = await interpretWithEnv([
      '/var session @planner = {',
      '  state: object?',
      '}'
    ].join('\n'));

    const definition = env.getSessionDefinition('planner');
    expect(definition).toBeDefined();

    const sessionId = 'structured-session-set';
    const instance = materializeSession(definition!, env, sessionId);
    env.setLlmToolConfig({ sessionId } as any);
    env.attachSessionInstance(sessionId, instance);

    const accessor = createSessionAccessorVariable('planner', definition!, env);
    const setMethod = (accessor.value as Record<string, any>).set;
    const setExecutable = setMethod?.internal?.executableDef;
    expect(setExecutable).toBeDefined();

    const factsources = Object.freeze([
      { kind: 'record-field', ref: 'contact_1', sourceRef: 'contact', field: 'email' } as any
    ]);
    const projection = {
      kind: 'field' as const,
      recordName: 'contact',
      fieldName: 'email',
      classification: 'fact' as const,
      dataTrust: 'trusted' as const,
      display: { kind: 'open' as const }
    };
    const payload = wrapStructured(
      { email: 'ada@example.com' },
      'object',
      undefined,
      { factsources }
    );
    setRecordProjectionMetadata(payload, projection);

    await setExecutable!.fn({ state: payload }, env);

    const stored = instance.getSlot('state');
    expect(isStructuredValue(stored)).toBe(true);
    if (!isStructuredValue(stored)) {
      throw new Error('expected structured session state');
    }
    expect(stored.data).toEqual({ email: 'ada@example.com' });
    expect(stored.mx.factsources).toEqual(factsources);
    expect(getRecordProjectionMetadata(stored)).toEqual(projection);
  });

  it('strips nested session snapshots from structured values copied into session snapshots', async () => {
    const { env } = await interpretWithEnv([
      '/var session @planner = {',
      '  raw: object?',
      '}'
    ].join('\n'));

    const definition = env.getSessionDefinition('planner');
    expect(definition).toBeDefined();

    const sessionId = 'snapshot-strip-session';
    const instance = materializeSession(definition!, env, sessionId);
    env.setLlmToolConfig({ sessionId } as any);
    env.attachSessionInstance(sessionId, instance);

    const nestedSessions = {
      planner: {
        state: {
          large: 'retained only by the original llm result'
        }
      }
    };
    const raw = wrapStructured(
      { answer: 'ok' },
      'object',
      undefined,
      {
        sessionId: 'inner-session',
        sessions: nestedSessions,
        factsources: [{ kind: 'record-field', ref: 'f_1', field: 'answer' } as any]
      }
    );
    expect(raw.mx.sessions).toEqual(nestedSessions);
    instance.setSlot('raw', raw);

    const snapshots = snapshotSessionsForFrame(sessionId, env);
    const clonedRaw = snapshots?.planner?.raw;
    expect(isStructuredValue(clonedRaw)).toBe(true);
    if (!isStructuredValue(clonedRaw)) {
      throw new Error('expected structured raw snapshot');
    }
    expect(clonedRaw.metadata?.sessions).toBeUndefined();
    expect(clonedRaw.mx.sessions).toBeUndefined();
    expect(clonedRaw.mx.sessionId).toBe('inner-session');
    expect(clonedRaw.mx.factsources).toEqual(raw.mx.factsources);
  });

  it('does not retain full payloads in private committed session write history', async () => {
    const { env } = await interpretWithEnv([
      '/var session @planner = {',
      '  state: object?',
      '}'
    ].join('\n'));

    const definition = env.getSessionDefinition('planner');
    expect(definition).toBeDefined();

    const sessionId = 'large-session-write';
    const instance = materializeSession(definition!, env, sessionId);
    env.setLlmToolConfig({ sessionId } as any);
    env.attachSessionInstance(sessionId, instance);

    const accessor = createSessionAccessorVariable('planner', definition!, env);
    const setMethod = (accessor.value as Record<string, any>).set;
    const setExecutable = setMethod?.internal?.executableDef;
    expect(setExecutable).toBeDefined();

    const largeState = {
      payload: 'x'.repeat(1_000_000),
      nested: { ok: true }
    };
    await setExecutable!.fn({ state: largeState }, env);

    const writes = env.getSessionWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      sessionName: 'planner',
      path: 'state',
      operation: 'set'
    });
    expect(writes[0]).not.toHaveProperty('value');
    expect(writes[0]).not.toHaveProperty('previous');
    expect(instance.getSlot('state')).toMatchObject(largeState);
  });

  it('does not build disabled trace or SDK session-write payloads', async () => {
    const { env } = await interpretWithEnv([
      '/var session @planner = {',
      '  state: object?',
      '}'
    ].join('\n'));

    const runtimeTraceSpy = vi.spyOn(env, 'emitRuntimeTraceEvent');
    const sdkEventSpy = vi.spyOn(env, 'emitSDKEvent');
    const definition = env.getSessionDefinition('planner');
    expect(definition).toBeDefined();

    const sessionId = 'disabled-observer-session-write';
    const instance = materializeSession(definition!, env, sessionId);
    env.setLlmToolConfig({ sessionId } as any);
    env.attachSessionInstance(sessionId, instance);

    const accessor = createSessionAccessorVariable('planner', definition!, env);
    const setMethod = (accessor.value as Record<string, any>).set;
    const setExecutable = setMethod?.internal?.executableDef;
    expect(setExecutable).toBeDefined();

    await setExecutable!.fn({
      state: {
        payload: 'x'.repeat(1_000_000),
        nested: { ok: true }
      }
    }, env);

    expect(runtimeTraceSpy).not.toHaveBeenCalled();
    expect(sdkEventSpy).not.toHaveBeenCalled();
  });

  it('does not build disabled final session trace payloads', async () => {
    const { env } = await interpretWithEnv([
      '/var session @planner = {',
      '  state: object?',
      '}'
    ].join('\n'));

    const definition = env.getSessionDefinition('planner');
    expect(definition).toBeDefined();

    const sessionId = 'disabled-final-session-trace';
    const instance = materializeSession(definition!, env, sessionId);
    env.attachSessionInstance(sessionId, instance);
    instance.setTraceSlot('state', {
      payload: 'x'.repeat(1_000_000),
      nested: { ok: true }
    });

    const runtimeTraceSpy = vi.spyOn(env, 'emitRuntimeTraceEvent');
    disposeSessionFrame(sessionId, env);

    expect(runtimeTraceSpy).not.toHaveBeenCalled();
  });

  it('reuses returned session snapshots when disposing a finalized frame', async () => {
    const { env } = await interpretWithEnv([
      '/var session @planner = {',
      '  state: object?',
      '}'
    ].join('\n'));

    const definition = env.getSessionDefinition('planner');
    expect(definition).toBeDefined();

    const sessionId = 'reuse-final-session-snapshot';
    const instance = materializeSession(definition!, env, sessionId);
    env.attachSessionInstance(sessionId, instance);

    let payloadReads = 0;
    const state = Object.create(null);
    Object.defineProperty(state, 'payload', {
      enumerable: true,
      get() {
        payloadReads += 1;
        return 'x'.repeat(1000);
      }
    });
    instance.setTraceSlot('state', state);

    const snapshots = snapshotSessionsForFrame(sessionId, env);
    expect(snapshots?.planner?.state).toMatchObject({ payload: expect.any(String) });
    expect(payloadReads).toBe(1);

    disposeSessionFrame(sessionId, env);

    expect(payloadReads).toBe(1);
  });

  it('stores session writes in one observed slot copy', async () => {
    const { env } = await interpretWithEnv([
      '/var session @planner = {',
      '  state: object?',
      '}'
    ].join('\n'));

    const definition = env.getSessionDefinition('planner');
    expect(definition).toBeDefined();

    const sessionId = 'single-observed-session-copy';
    const instance = materializeSession(definition!, env, sessionId);
    env.setLlmToolConfig({ sessionId } as any);
    env.attachSessionInstance(sessionId, instance);

    const accessor = createSessionAccessorVariable('planner', definition!, env);
    const setMethod = (accessor.value as Record<string, any>).set;
    const setExecutable = setMethod?.internal?.executableDef;
    expect(setExecutable).toBeDefined();

    const largeState = {
      payload: 'x'.repeat(1_000_000),
      nested: { ok: true }
    };
    await setExecutable!.fn({ state: largeState }, env);

    expect((instance as any).values.has('state')).toBe(false);
    expect(instance.hasSlot('state')).toBe(true);
    expect(instance.getSlot('state')).toMatchObject(largeState);
  });

  it('reuses unchanged session subtrees across observed slot writes', async () => {
    const { env } = await interpretWithEnv([
      '/var session @planner = {',
      '  state: object?',
      '}'
    ].join('\n'));

    const definition = env.getSessionDefinition('planner');
    expect(definition).toBeDefined();

    const sessionId = 'reuse-observed-session-subtrees';
    const instance = materializeSession(definition!, env, sessionId);
    env.setLlmToolConfig({ sessionId } as any);
    env.attachSessionInstance(sessionId, instance);

    const accessor = createSessionAccessorVariable('planner', definition!, env);
    const setMethod = (accessor.value as Record<string, any>).set;
    const setExecutable = setMethod?.internal?.executableDef;
    expect(setExecutable).toBeDefined();

    await setExecutable!.fn({
      state: {
        stable: { payload: 'x'.repeat(1_000_000) },
        changed: 1
      }
    }, env);

    const firstStoredState = instance.getSlot('state') as any;
    await setExecutable!.fn({
      state: {
        stable: firstStoredState.stable,
        changed: 2
      }
    }, env);

    const secondStoredState = instance.getSlot('state') as any;
    expect(secondStoredState.changed).toBe(2);
    expect(secondStoredState.stable).toBe(firstStoredState.stable);
  });

  it('returns null for result .mx.sessions when no session is attached', async () => {
    const { env } = await interpretWithEnv([
      '/exe llm @agent(prompt, config) = js {',
      '  return "ok";',
      '}',
      '/var @raw = @agent("hello", {})'
    ].join('\n'));

    const sessions = await readFieldChain(env, 'raw', ['mx', 'sessions']);
    expect(sessions).toBeNull();
  });

  it('rejects llm executables as session update functions', async () => {
    const { env } = await interpretWithEnv([
      '/var session @planner = {',
      '  count: number?',
      '}',
      '/exe llm @bad(value, config) = js {',
      '  return value;',
      '}'
    ].join('\n'));

    const definition = env.getSessionDefinition('planner');
    expect(definition).toBeDefined();

    const sessionId = 'test-session';
    env.setLlmToolConfig({ sessionId } as any);
    env.attachSessionInstance(sessionId, materializeSession(definition!, env, sessionId));

    const accessor = createSessionAccessorVariable('planner', definition!, env);
    const updateMethod = (accessor.value as Record<string, any>).update;
    const updateExecutable = updateMethod?.internal?.executableDef;
    expect(updateExecutable).toBeDefined();

    await expect(
      updateExecutable!.fn('count', env.getVariable('bad'), env)
    ).rejects.toMatchObject({
      code: 'INVALID_SESSION_UPDATE_EXECUTABLE'
    });
  });

  it('supports same-frame read-your-writes and discard through the guard session buffer overlay', async () => {
    const { env } = await interpretWithEnv([
      '/var session @planner = {',
      '  count: number?',
      '}'
    ].join('\n'));

    const definition = env.getSessionDefinition('planner');
    expect(definition).toBeDefined();

    const sessionId = 'guard-overlay-session';
    env.setLlmToolConfig({ sessionId } as any);
    const instance = materializeSession(definition!, env, sessionId);
    instance.setSlot('count', 0);
    instance.setTraceSlot('count', 0);
    env.attachSessionInstance(sessionId, instance);

    const accessor = createSessionAccessorVariable('planner', definition!, env);
    const incrementMethod = (accessor.value as Record<string, any>).increment;
    const incrementExecutable = incrementMethod?.internal?.executableDef;
    expect(incrementExecutable).toBeDefined();

    const buffer = createGuardSessionWriteBuffer();
    env.pushSessionWriteBuffer(buffer);
    try {
      await incrementExecutable!.fn('count', env);

      expect(buffer.readOverlay('count')).toEqual({
        found: true,
        value: 1
      });
      expect((accessor.value as Record<string, any>).count).toBe(1);

      buffer.discard();

      expect((accessor.value as Record<string, any>).count).toBe(0);
    } finally {
      env.popSessionWriteBuffer(buffer);
    }
  });
});
