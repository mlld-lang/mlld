import { describe, expect, it } from 'vitest';
import { interpret } from '@interpreter/index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

describe('evaluateExecInvocation runtime trace', () => {
  it('records llm call durations in verbose traces', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = `
/exe llm @agent(prompt, config) = js {
  return {
    ok: true,
    prompt,
    model: config?.model ?? null
  };
}
/show @agent("hello", { model: "fake-model" })
    `.trim();

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'verbose'
    }) as any;

    const llmCall = result.traceEvents.find((event: any) => event.event === 'llm.call');
    expect(llmCall).toBeDefined();
    expect(llmCall.data.phase).toBe('finish');
    expect(llmCall.data.model).toBe('fake-model');
    expect(llmCall.data.ok).toBe(true);
    expect(typeof llmCall.data.durationMs).toBe('number');
    expect(llmCall.data.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('adds frame nesting to nested llm call trace scopes', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = [
      '/var session @outerstate = {',
      '  count: number?',
      '}',
      '/var session @innerstate = {',
      '  count: number?',
      '}',
      '/exe llm @inner(prompt, config) = [',
      '  @innerstate.increment("count")',
      '  => `inner:@prompt`',
      ']',
      '/exe llm @outer(prompt, config) = [',
      '  @outerstate.increment("count")',
      '  let @child = @inner("nested", { model: "inner-model" }) with { session: @innerstate }',
      '  => `outer:@child`',
      ']',
      '/show @outer("root", { model: "outer-model" }) with { session: @outerstate }'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'verbose'
    }) as any;

    const llmCalls = result.traceEvents.filter((event: any) => event.event === 'llm.call');
    const outerCall = llmCalls.find((event: any) => event.data.model === 'outer-model');
    const innerCall = llmCalls.find((event: any) => event.data.model === 'inner-model');
    const outerSessionWrite = result.traceEvents.find(
      (event: any) => event.event === 'session.write' && event.data.sessionName === 'outerstate'
    );
    const innerSessionWrite = result.traceEvents.find(
      (event: any) => event.event === 'session.write' && event.data.sessionName === 'innerstate'
    );

    expect(outerCall).toBeDefined();
    expect(innerCall).toBeDefined();
    expect(outerCall.scope.frameId).toEqual(expect.any(String));
    expect(outerCall.scope.parentFrameId).toBeUndefined();
    expect(innerCall.scope.frameId).toEqual(expect.any(String));
    expect(innerCall.scope.parentFrameId).toBe(outerCall.scope.frameId);
    expect(innerCall.scope.frameId).not.toBe(outerCall.scope.frameId);

    expect(outerSessionWrite).toBeDefined();
    expect(outerSessionWrite.scope.frameId).toBe(outerSessionWrite.data.frameId);
    expect(outerSessionWrite.scope.parentFrameId).toBeUndefined();
    expect(innerSessionWrite).toBeDefined();
    expect(innerSessionWrite.scope.frameId).toBe(innerSessionWrite.data.frameId);
    expect(innerSessionWrite.scope.parentFrameId).toBe(outerCall.scope.frameId);
  });

  it('uses the enclosing frame as parent for parallel nested llm calls', async () => {
    const fileSystem = new MemoryFileSystem();
    const pathService = new PathService();
    const source = [
      '/var session @parentstate = {',
      '  count: number?',
      '}',
      '/var session @workerstate = {',
      '  count: number?',
      '}',
      '/exe llm @worker(name, config) = [',
      '  @workerstate.increment("count")',
      '  => `worker:@name`',
      ']',
      '/exe llm @parent(prompt, config) = [',
      '  @parentstate.increment("count")',
      '  let @results = for parallel(2) @name in ["a", "b"] => @worker(@name, { model: "worker-model" }) with { session: @workerstate }',
      '  => @results',
      ']',
      '/show @parent("root", { model: "parallel-parent" }) with { session: @parentstate }'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem,
      pathService,
      basePath: '/',
      mode: 'structured',
      trace: 'verbose'
    }) as any;

    const parentCall = result.traceEvents.find(
      (event: any) => event.event === 'llm.call' && event.data.model === 'parallel-parent'
    );
    const workerCalls = result.traceEvents.filter(
      (event: any) => event.event === 'llm.call' && event.data.model === 'worker-model'
    );

    expect(parentCall).toBeDefined();
    expect(parentCall.scope.frameId).toEqual(expect.any(String));
    expect(workerCalls).toHaveLength(2);
    expect(new Set(workerCalls.map((event: any) => event.scope.frameId)).size).toBe(2);
    expect(new Set(workerCalls.map((event: any) => event.scope.parentFrameId))).toEqual(
      new Set([parentCall.scope.frameId])
    );
  });
});
