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

  it('returns collection input-record policy failures as failed llm tool results', async () => {
    const source = [
      '/record @event = { facts: [id: string] }',
      '/record @add_parts_inputs = {',
      '  facts: [event_id: handle],',
      '  data: [participants: array],',
      '  validate: "strict"',
      '}',
      '/exe @get_event() = { id: "24" } => event',
      '/exe tool:w @add_parts(participants, event_id) = {',
      '  ok: true,',
      '  event_id: @event_id,',
      '  participants: @participants',
      '} with { controlArgs: [] }',
      '/var @event = @get_event()',
      '/var tools @writeTools = {',
      '  add_parts: {',
      '    mlld: @add_parts,',
      '    inputs: @add_parts_inputs,',
      '    labels: ["tool:w"],',
      '    controlArgs: []',
      '  }',
      '}',
      '/var @taskPolicy = {',
      '  defaults: { rules: [] }',
      '}',
      '/exe llm @agent() = when [',
      '  * => @writeTools["add_parts"]({ participants: ["bob@test.com"], event_id: "24" }) with { policy: @taskPolicy }',
      ']',
      '/show @agent()'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem: new MemoryFileSystem(),
      pathService: new PathService(),
      basePath: '/',
      mode: 'structured',
      trace: 'verbose'
    }) as any;

    expect(result.output).toContain('tool_input_validation_failed');
    expect(result.output).toContain('event_id');

    const policyError = result.traceEvents.find((event: any) => event.event === 'policy.error');
    expect(policyError).toBeDefined();
    expect(policyError.data).toMatchObject({
      tool: 'add_parts',
      code: 'input_type_mismatch',
      field: 'event_id',
      phase: 'dispatch',
      direction: 'input'
    });
    expect(policyError.data.message).toMatch(/must be handle/);
    expect(policyError.data.error).toMatchObject({
      name: 'MlldPolicyError',
      code: 'input_type_mismatch'
    });

    const toolResult = result.traceEvents.find(
      (event: any) => event.event === 'llm.tool_result' && event.data.tool === 'add_parts'
    );
    expect(toolResult).toBeDefined();
    expect(toolResult.data.ok).toBe(false);
    expect(toolResult.data.error).toMatch(/must be handle/);
    expect(toolResult.data.errorDetails).toMatchObject({
      name: 'MlldPolicyError',
      code: 'input_type_mismatch'
    });
  });

  it('returns authorization denials inside llm tool frames as failed tool results', async () => {
    const source = [
      '/record @account = { facts: [id: string] }',
      '/exe @get_account() = { id: "acct-1" } => account',
      '/exe tool:w @send_money(recipient, amount) = `sent:@recipient:@amount` with { controlArgs: ["recipient"] }',
      '/var @account = @get_account()',
      '/var tools @writeTools = {',
      '  send_money: {',
      '    mlld: @send_money,',
      '    labels: ["tool:w"],',
      '    expose: ["recipient", "amount"],',
      '    controlArgs: ["recipient"]',
      '  }',
      '}',
      '/var @taskPolicy = {',
      '  authorizations: {',
      '    allow: {',
      '      send_money: {',
      '        args: {',
      '          recipient: [@account.id]',
      '        }',
      '      }',
      '    }',
      '  }',
      '}',
      '/exe llm @agent() = [',
      '  => @writeTools["send_money"]({ recipient: "acct-2", amount: 5 }) with { policy: @taskPolicy }',
      ']',
      '/show @agent()'
    ].join('\n');

    const result = await interpret(source, {
      fileSystem: new MemoryFileSystem(),
      pathService: new PathService(),
      basePath: '/',
      mode: 'structured',
      trace: 'verbose'
    }) as any;

    expect(result.output).toContain('policy_denied');
    expect(result.output).toContain('operation arguments did not match');

    const authDeny = result.traceEvents.find(
      (event: any) => event.event === 'auth.deny' && event.data.tool === 'send_money'
    );
    expect(authDeny).toBeDefined();

    const policyError = result.traceEvents.find((event: any) => event.event === 'policy.error');
    expect(policyError).toBeDefined();
    expect(policyError.data.tool).toBe('send_money');
    expect(policyError.data.code).toMatch(/^POLICY_/);

    const toolResult = result.traceEvents.find(
      (event: any) => event.event === 'llm.tool_result' && event.data.tool === 'send_money'
    );
    expect(toolResult).toBeDefined();
    expect(toolResult.data.ok).toBe(false);
    expect(toolResult.data.error).toMatch(/operation arguments did not match/);
  });
});
