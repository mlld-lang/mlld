import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execute, MemoryAstCache } from './execute';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { ExecuteError } from './types';
import { VirtualFS } from '@services/fs/VirtualFS';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';

describe('execute', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  const routePath = '/routes/route.mlld';
  const cleanupDirs: string[] = [];
  const cleanupGlobals: string[] = [];

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    MemoryAstCache.clear();
  });

  afterEach(async () => {
    await Promise.all(cleanupDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
    for (const key of cleanupGlobals.splice(0)) {
      delete (globalThis as Record<string, unknown>)[key];
    }
  });

  it('returns structured result with metrics and state writes', async () => {
    await fileSystem.writeFile(
      routePath,
      `
/show "hello"
/output "world" to "state://greeting"
      `.trim()
    );

    const result = await execute(routePath, undefined, { fileSystem, pathService });

    expect(result).toHaveProperty('output');
    expect((result as any).output.trim()).toBe('hello');
    expect((result as any).stateWrites).toEqual([
      expect.objectContaining({ path: 'greeting', value: 'world', operation: 'set' })
    ]);
    const metrics = (result as any).metrics;
    expect(metrics).toBeDefined();
    expect(metrics.cacheHit).toBe(false);
    expect(metrics.parseMs).toBeGreaterThanOrEqual(0);
    expect(metrics.totalMs).toBeGreaterThanOrEqual(metrics.parseMs);
    expect(metrics.effectCount).toBeGreaterThan(0);
  });

  it('preserves object and boolean values for state:// writes', async () => {
    await fileSystem.writeFile(
      routePath,
      `
/var @payload = {"enabled": true, "nested": {"count": 2}}
/var @flag = true
/output @payload to "state://payload"
/output @flag to "state://flag"
/show \`count=@state.payload.nested.count flag=@state.flag\`
      `.trim()
    );

    const result = await execute(routePath, undefined, {
      fileSystem,
      pathService,
      state: { payload: null, flag: false }
    });

    expect(result.output).toContain('count=2 flag=true');
    expect((result as any).stateWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'payload',
          value: { enabled: true, nested: { count: 2 } },
          operation: 'set'
        }),
        expect.objectContaining({
          path: 'flag',
          value: true,
          operation: 'set'
        })
      ])
    );
  });

  it('preserves inline object literal values for state:// writes', async () => {
    await fileSystem.writeFile(
      routePath,
      `
/var @count = 2
/output { enabled: true, nested: { count: @count } } to "state://payload"
/show \`count=@state.payload.nested.count enabled=@state.payload.enabled\`
      `.trim()
    );

    const result = await execute(routePath, undefined, {
      fileSystem,
      pathService,
      state: { payload: null }
    });

    expect(result.output).toContain('count=2 enabled=true');
    expect((result as any).stateWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'payload',
          value: { enabled: true, nested: { count: 2 } },
          operation: 'set'
        })
      ])
    );
  });

  it('marks cache hits on subsequent executions', async () => {
    await fileSystem.writeFile(routePath, '/show "cached"');

    await execute(routePath, undefined, { fileSystem, pathService });
    const second = await execute(routePath, undefined, { fileSystem, pathService });

    const metrics = (second as any).metrics;
    expect(metrics.cacheHit).toBe(true);
    expect(metrics.parseMs).toBe(0);
  });

  it('collects structured guard denials in execute results when the script handles them', async () => {
    await fileSystem.writeFile(
      routePath,
      `
/guard @blocker before op:exe = when [
  @mx.op.name == "send" => deny "blocked by policy"
  * => allow
]
/exe @send(value) = when [
  denied => "fallback"
  * => \`sent: @value\`
]
/show @send("hello")
      `.trim()
    );

    const result = await execute(routePath, undefined, { fileSystem, pathService });

    expect(result.output).toContain('fallback');
    expect(result.denials).toEqual([
      expect.objectContaining({
        guard: 'blocker',
        operation: 'send',
        reason: 'blocked by policy',
        rule: null,
        labels: [],
        args: { value: 'hello' }
      })
    ]);
  });

  it('propagates metrics in stream mode', async () => {
    await fileSystem.writeFile(routePath, '/show "stream"');

    const handle = (await execute(routePath, undefined, {
      fileSystem,
      pathService,
      stream: true
    })) as any;

    let eventMetrics: any;
    handle.on('execution:complete', (event: any) => {
      eventMetrics = event.result?.metrics;
    });

    const result = await handle.result();
    expect(result.metrics).toBeDefined();
    expect(result.metrics.cacheHit).toBe(false);
    await handle.done();
    expect(eventMetrics).toEqual(result.metrics);
  });

  it('allows async iteration over stream events', async () => {
    await fileSystem.writeFile(routePath, '/show "iterable"');

    const handle = (await execute(routePath, undefined, {
      fileSystem,
      pathService,
      stream: true
    })) as any;

    const types: string[] = [];
    for await (const event of handle as AsyncIterable<any>) {
      types.push(event.type);
      if (event.type === 'execution:complete') {
        expect(event.result).toBeDefined();
      }
    }

    expect(types).toContain('effect');
    expect(types).toContain('execution:complete');
  });

  it('yields runtime trace events during stream execution when tracing is enabled', async () => {
    await fileSystem.writeFile(
      routePath,
      `
/record @contact = {
  key: id,
  facts: [id: string]
}
/shelf @pipeline = {
  selected: contact?
}
/exe @emitContact() = { id: "c_1" } => contact
/show @shelf.write(@pipeline.selected, @emitContact())
      `.trim()
    );

    const handle = (await execute(routePath, undefined, {
      fileSystem,
      pathService,
      stream: true,
      trace: 'effects'
    })) as any;

    const events: any[] = [];
    for await (const event of handle as AsyncIterable<any>) {
      events.push(event);
    }

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'trace_event',
          traceEvent: expect.objectContaining({
            event: 'shelf.write',
            category: 'shelf'
          })
        })
      ])
    );
  });

  it('wraps missing files as ExecuteError', async () => {
    await expect(execute('/nope.mlld', undefined, { fileSystem, pathService })).rejects.toBeInstanceOf(ExecuteError);
    await expect(execute('/nope.mlld', undefined, { fileSystem, pathService })).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND'
    });
  });

  it('wraps parse errors as ExecuteError', async () => {
    await fileSystem.writeFile(routePath, '/var @oops = {');

    await expect(execute(routePath, undefined, { fileSystem, pathService })).rejects.toMatchObject({
      code: 'PARSE_ERROR'
    });
  });

  it('injects payload and state dynamic modules', async () => {
    await fileSystem.writeFile(
      routePath,
      '/import { @text } from @payload\n/import { @greeting } from @state\n/show "@greeting @text"'
    );

    const result = await execute(
      routePath,
      { text: 'hello' },
      { state: { greeting: 'hi' }, fileSystem, pathService }
    );

    expect(result.output).toContain('hi hello');

    // Also verify the resolver can resolve the modules
    const resolverManager = (result as any).environment?.getResolverManager();
    const dynamicResolver = resolverManager
      ?.getResolversForContext('import')
      ?.find((resolver: any) => resolver.name === 'dynamic');

    expect(dynamicResolver?.canResolve('@payload')).toBe(true);
    expect(dynamicResolver?.canResolve('@state')).toBe(true);

    const payloadModule = await dynamicResolver?.resolve('@payload');
    const stateModule = await dynamicResolver?.resolve('@state');

    expect(payloadModule?.content).toContain("@text = 'hello'");
    expect(stateModule?.content).toContain("@greeting = 'hi'");
  });

  it('applies per-field payload labels to imports and direct payload access', async () => {
    await fileSystem.writeFile(
      routePath,
      [
        '/import "@payload" as @p',
        '/import { @query, @tool_result } from @payload',
        '/show @query.mx.labels.includes("trusted")',
        '/show @tool_result.mx.labels.includes("untrusted")',
        '/show @p.query.mx.labels.includes("trusted")',
        '/show @p.tool_result.mx.labels.includes("untrusted")',
        '/show @payload.query.mx.labels.includes("trusted")',
        '/show @payload.tool_result.mx.labels.includes("untrusted")'
      ].join('\n')
    );

    const result = await execute(
      routePath,
      { query: 'hello', tool_result: 'external' },
      {
        fileSystem,
        pathService,
        payloadLabels: {
          query: ['trusted'],
          tool_result: ['untrusted']
        }
      }
    );

    expect(
      result.output
        .trim()
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
    ).toEqual(['true', 'true', 'true', 'true', 'true', 'true']);

    const resolverManager = (result as any).environment?.getResolverManager();
    const dynamicResolver = resolverManager
      ?.getResolversForContext('import')
      ?.find((resolver: any) => resolver.name === 'dynamic');

    const payloadModule = await dynamicResolver?.resolve('@payload');
    expect(payloadModule?.content).toContain("/var trusted @query = 'hello'");
    expect(payloadModule?.content).toContain("/var untrusted @tool_result = 'external'");
  });

  it('applies payload labels and labeled state updates during stream execution', async () => {
    await fileSystem.writeFile(
      routePath,
      [
        'loop(99999, 10ms) until @state.exit [',
        '  continue',
        ']',
        '/show @payload.history.mx.labels.includes("untrusted")',
        '/show @state.tool_result.mx.labels.includes("untrusted")',
        '/show @state.tool_result'
      ].join('\n')
    );

    const handle = (await execute(
      routePath,
      { history: 'tool transcript' },
      {
        fileSystem,
        pathService,
        mode: 'strict',
        stream: true,
        state: { exit: false, tool_result: null },
        payloadLabels: {
          history: ['untrusted']
        }
      }
    )) as any;

    await handle.updateState('tool_result', 'tool output', ['untrusted']);
    await handle.updateState('exit', true);

    const result = await handle.result();

    expect(
      result.output
        .trim()
        .split('\n')
        .map((line: string) => line.trim())
        .filter(Boolean)
    ).toEqual(['true', 'true', 'tool output']);
  });

  it('supports writeFile during stream execution with execution provenance', async () => {
    await fileSystem.writeFile('/package.json', '{}');
    await fileSystem.writeFile(
      routePath,
      [
        'loop(99999, 10ms) until @state.exit [',
        '  continue',
        ']',
        '/show "done"'
      ].join('\n')
    );

    const handle = (await execute(routePath, undefined, {
      fileSystem,
      pathService,
      mode: 'strict',
      stream: true,
      state: { exit: false }
    })) as any;

    const writeResult = await handle.writeFile('out.txt', 'hello from sdk');

    expect(writeResult.path).toBe('/routes/out.txt');
    expect(writeResult.status).toBe('verified');
    expect(writeResult.signer).toBe('agent:route');
    expect(writeResult.metadata).toMatchObject({
      taint: ['untrusted'],
      provenance: {
        sourceType: 'mlld_execution',
        scriptPath: routePath
      }
    });
    expect((writeResult.metadata as any)?.provenance?.sourceId).toEqual(expect.any(String));
    expect(await fileSystem.readFile('/routes/out.txt')).toBe('hello from sdk');

    await handle.updateState('exit', true);
    const result = await handle.result();
    expect(result.output.trim()).toBe('done');

    await expect(handle.writeFile('late.txt', 'too late')).rejects.toThrow(
      'StreamExecution already completed'
    );
  });

  it('applies checkpoint options through SDK execute into interpreter runtime', async () => {
    const checkpointRoot = await mkdtemp(path.join(os.tmpdir(), 'sdk-execute-checkpoint-'));
    cleanupDirs.push(checkpointRoot);
    const counterKey = '__sdkExecuteCheckpointCounter';
    cleanupGlobals.push(counterKey);
    (globalThis as Record<string, unknown>)[counterKey] = 0;

    await fileSystem.writeFile(
      routePath,
      `
/exe llm @review(prompt, model) = js {
  globalThis.${counterKey} = (globalThis.${counterKey} || 0) + 1;
  return "review:" + globalThis.${counterKey} + ":" + prompt + ":" + model;
}
/var @result = @review("src/a.ts", "sonnet")
/show @result
      `.trim()
    );

    const first = await execute(routePath, undefined, {
      fileSystem,
      pathService,
      checkpoint: true,
      checkpointScriptName: 'sdk-route',
      checkpointCacheRootDir: checkpointRoot
    });
    const second = await execute(routePath, undefined, {
      fileSystem,
      pathService,
      checkpoint: true,
      checkpointScriptName: 'sdk-route',
      checkpointCacheRootDir: checkpointRoot
    });

    expect(first.output).toContain('review:1:src/a.ts:sonnet');
    expect(second.output).toContain('review:1:src/a.ts:sonnet');
    expect((globalThis as Record<string, unknown>)[counterKey]).toBe(1);
  });

  it('supports execute() over VirtualFS while preserving backing immutability until flush', async () => {
    const backing = new MemoryFileSystem();
    await backing.mkdir('/routes', { recursive: true });
    await backing.mkdir('/project', { recursive: true });
    await backing.writeFile(
      '/routes/vfs-route.mlld',
      [
        '/output "shadow-write" to "/project/result.txt"',
        '/show "ok"'
      ].join('\n')
    );

    const vfs = VirtualFS.over(backing);
    const result = await execute('/routes/vfs-route.mlld', undefined, {
      fileSystem: vfs,
      pathService
    });

    expect(result.output.trim()).toBe('ok');
    expect(await backing.exists('/project/result.txt')).toBe(false);
    expect(await vfs.readFile('/project/result.txt')).toBe('shadow-write');

    await vfs.flush('/project/result.txt');
    expect(await backing.readFile('/project/result.txt')).toBe('shadow-write');
  });
});
