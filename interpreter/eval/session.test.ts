import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { extractVariableValue } from '@interpreter/utils/variable-resolution';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { Environment } from '@interpreter/env/Environment';
import {
  createGuardSessionWriteBuffer,
  createSessionAccessorVariable,
  materializeSession
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
    expect(result.sessions).toEqual([
      expect.objectContaining({
        name: 'planner',
        finalState: {
          count: 3,
          snap: 2,
          log: ['finish']
        }
      })
    ]);
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
