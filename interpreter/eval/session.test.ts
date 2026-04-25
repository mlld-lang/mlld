import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { accessFields } from '@interpreter/utils/field-access';
import { asText, isStructuredValue, wrapStructured } from '@interpreter/utils/structured-value';
import { Environment } from '@interpreter/env/Environment';
import {
  createGuardSessionWriteBuffer,
  createSessionAccessorVariable,
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
