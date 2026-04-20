import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { interpret } from '@interpreter/index';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { createCallMcpConfig } from '@interpreter/env/executors/call-mcp-config';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { fileURLToPath } from 'url';

const callToolFromConfigPath = fileURLToPath(
  new URL('../tests/support/mcp/call-tool-from-config.cjs', import.meta.url)
);

function createEnvironment(basePath = '/tmp/mlld-runtime-trace'): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), basePath);
}

describe('runtime trace', () => {
  it('collects runtime trace events end-to-end when tracing is enabled', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  selected: contact?
}
/exe @emitContact() = {
  id: "c_1",
  email: "ada@example.com",
  name: "Ada"
} => contact
/show @shelf.write(@pipeline.selected, @emitContact())
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'effects'
    }) as any;

    expect(result.traceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'shelf',
          event: 'shelf.write',
          level: 'effects',
          scope: expect.objectContaining({
            exe: '@shelf.write'
          })
        })
      ])
    );
  });

  it('includes approximate size metadata on summarized traced values', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/record @contact = {
  key: id,
  facts: [id: string, email: string, name: string]
}
/shelf @pipeline = {
  selected: contact?
}
/exe @emitContact() = {
  id: "c_1",
  email: "ada@example.com",
  name: "Ada"
} => contact
/show @shelf.write(@pipeline.selected, @emitContact())
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'effects'
    }) as any;

    const shelfWrite = result.traceEvents.find((event: any) => event.event === 'shelf.write');
    expect(shelfWrite?.data?.value).toEqual(
      expect.objectContaining({
        kind: 'object',
        bytes: expect.any(Number),
        human: expect.stringMatching(/B$/)
      })
    );
  });

  it('supports handle tracing via the handles alias and emits renamed handle lifecycle events', async () => {
    const env = createEnvironment();
    env.setRuntimeTrace('handles');

    const callConfig = await createCallMcpConfig({
      tools: [],
      env
    });
    env.setLlmToolConfig(callConfig);

    try {
      const issued = env.issueHandle('ada@example.com');
      env.emitRuntimeTrace('effects', 'shelf', 'shelf.write', {
        slot: '@state.selected',
        action: 'write',
        success: true
      });
      env.resolveHandle(issued.handle);
      await callConfig.cleanup();

      expect(env.getRuntimeTraceEvents()).toEqual([
        expect.objectContaining({
          category: 'handle',
          event: 'handle.issued',
          data: expect.objectContaining({
            handle: issued.handle,
            sessionId: callConfig.sessionId
          })
        }),
        expect.objectContaining({
          category: 'handle',
          event: 'handle.resolved',
          data: expect.objectContaining({
            handle: issued.handle,
            sessionId: callConfig.sessionId
          })
        }),
        expect.objectContaining({
          category: 'handle',
          event: 'handle.released',
          data: {
            sessionId: callConfig.sessionId,
            handleCount: 1
          }
        })
      ]);
    } finally {
      env.cleanup();
    }
  });

  it('includes handle events in verbose traces', () => {
    const env = createEnvironment();
    env.setRuntimeTrace('verbose');

    env.issueHandle('ada@example.com');

    expect(env.getRuntimeTraceEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'handle',
          event: 'handle.issued'
        })
      ])
    );

    env.cleanup();
  });

  it('emits redacted session write and final trace events at effects level', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = [
      '/var session @planner = {',
      '  note: string?',
      '}',
      '/var secret @secretNote = "sk-live-123"',
      '/exe tool:w @track() = [',
      '  @planner.write("note", @secretNote)',
      '  => "ok"',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @result = @agent("hello", { tools: @toolList }) with { session: @planner }'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'effects'
    }) as any;

    const writeEvent = result.traceEvents.find((event: any) => event.event === 'session.write');
    const finalEvent = result.traceEvents.find((event: any) => event.event === 'session.final');

    expect(writeEvent).toBeDefined();
    expect(writeEvent.data.value).toMatch(/^<labels=\[secret\] size=\d+>$/);
    expect(finalEvent).toBeDefined();
    expect(finalEvent.data.finalState.note).toMatch(/^<labels=\[secret\] size=\d+>$/);
    expect(result.sessions).toEqual([
      expect.objectContaining({
        name: 'planner',
        finalState: {
          note: 'sk-live-123'
        }
      })
    ]);
  });

  it('emits session.seed events for seeded slots before the first callback', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = [
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
    ].join('\n');

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'effects'
    }) as any;

    expect(result.traceEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'session.seed',
          data: expect.objectContaining({
            sessionName: 'planner',
            path: 'query',
            value: 'seeded'
          })
        }),
        expect.objectContaining({
          event: 'session.seed',
          data: expect.objectContaining({
            sessionName: 'planner',
            path: 'count',
            value: 4
          })
        })
      ])
    );
  });

  it('shows full session values at verbose trace level', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = [
      '/var session @planner = {',
      '  note: string?',
      '}',
      '/var secret @secretNote = "sk-live-123"',
      '/exe tool:w @track() = [',
      '  @planner.write("note", @secretNote)',
      '  => "ok"',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @result = @agent("hello", { tools: @toolList }) with { session: @planner }'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'verbose'
    }) as any;

    const writeEvent = result.traceEvents.find((event: any) => event.event === 'session.write');
    const finalEvent = result.traceEvents.find((event: any) => event.event === 'session.final');
    const unwrapTraceValue = (value: any) =>
      isStructuredValue(value)
        ? asText(value)
        : value && typeof value === 'object' && 'data' in value
          ? value.data
          : value;

    const verboseWriteValue = writeEvent?.data?.value;
    const verboseFinalValue = finalEvent?.data?.finalState?.note;

    expect(unwrapTraceValue(verboseWriteValue)).toBe('sk-live-123');
    expect(unwrapTraceValue(verboseFinalValue)).toBe('sk-live-123');
  });

  it('applies defaults.unlabeled redaction to session traces at effects level', async () => {
    const fileSystem = new MemoryFileSystem();
    await fileSystem.writeFile('/note.txt', 'from file');
    const pathService = new PathService();
    const source = [
      '/var @policyConfig = {',
      '  defaults: { unlabeled: "untrusted" }',
      '}',
      '/policy @p = union(@policyConfig)',
      '/var session @planner = {',
      '  note: string?',
      '}',
      '/var @note = </note.txt>',
      '/exe tool:w @track() = [',
      '  @planner.write("note", @note)',
      '  => "ok"',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @result = @agent("hello", { tools: @toolList }) with { session: @planner }'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'effects'
    }) as any;

    const writeEvent = result.traceEvents.find((event: any) => event.event === 'session.write');
    const finalEvent = result.traceEvents.find((event: any) => event.event === 'session.final');

    expect(writeEvent?.data?.value).toMatch(/^<labels=\[untrusted\] size=\d+>$/);
    expect(finalEvent?.data?.finalState?.note).toMatch(/^<labels=\[untrusted\] size=\d+>$/);
    expect(result.sessions[0]?.finalState?.note).toBe('from file');
  });

  it('caps oversized session trace values at effects level', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const largeValue = 'x'.repeat(1500);
    const source = [
      '/var session @planner = {',
      '  log: string?',
      '}',
      '/exe llm @agent(prompt, config) = js {',
      '  return "ok";',
      '}',
      '/var @result = @agent("hello", {}) with {',
      '  session: @planner,',
      `  seed: { log: "${largeValue}" }`,
      '}'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'effects'
    }) as any;

    const seedEvent = result.traceEvents.find((event: any) => event.event === 'session.seed');
    const finalEvent = result.traceEvents.find((event: any) => event.event === 'session.final');

    expect(seedEvent?.data?.value).toMatch(/^<size=\d+>$/);
    expect(finalEvent?.data?.finalState?.log).toMatch(/^<size=\d+>$/);
    expect(result.sessions[0]?.finalState?.log).toHaveLength(1500);
  });

  it('emits the committed session snapshot on guarded denial without leaking denied writes', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const env = new Environment(fileSystem, pathService, '/');
    env.setRuntimeTrace('effects');
    const runtimeEnv = env.createChild();
    const source = [
      '/guard @block before tool:w = when [',
      '  * => deny "blocked"',
      ']',
      '/var session @planner = {',
      '  count: number?',
      '}',
      '/exe tool:w @track() = [',
      '  @planner.increment("count")',
      '  => "ok"',
      ']',
      '/var @toolList = [@track]',
      `/exe llm @agent(prompt, config) = cmd { node "${callToolFromConfigPath}" "@mx.llm.config" track '{}' }`,
      '/var @result = @agent("hello", { tools: @toolList }) with {',
      '  session: @planner,',
      '  seed: { count: 1 }',
      '}'
    ].join('\n');

    await expect(evaluate(parseSync(source), runtimeEnv)).rejects.toThrow(/blocked/i);

    const sessionEvents = runtimeEnv
      .getRuntimeTraceEvents()
      .filter(event => event.category === 'session');

    expect(sessionEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'session.final',
          data: expect.objectContaining({
            finalState: {
              count: 1
            }
          })
        })
      ])
    );
    expect(sessionEvents).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          event: 'session.write'
        })
      ])
    );
  });
});
