import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execute, MemoryAstCache } from './execute';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { ExecuteError } from './types';
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

  it('marks cache hits on subsequent executions', async () => {
    await fileSystem.writeFile(routePath, '/show "cached"');

    await execute(routePath, undefined, { fileSystem, pathService });
    const second = await execute(routePath, undefined, { fileSystem, pathService });

    const metrics = (second as any).metrics;
    expect(metrics.cacheHit).toBe(true);
    expect(metrics.parseMs).toBe(0);
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
});
