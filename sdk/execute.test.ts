import { beforeEach, describe, expect, it } from 'vitest';
import { executeRoute, MemoryRouteCache } from './execute';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { ExecuteError } from './types';

describe('executeRoute', () => {
  let fileSystem: MemoryFileSystem;
  let pathService: PathService;
  const routePath = '/routes/route.mlld';

  beforeEach(() => {
    fileSystem = new MemoryFileSystem();
    pathService = new PathService();
    MemoryRouteCache.clear();
  });

  it('returns structured result with metrics and state writes', async () => {
    await fileSystem.writeFile(
      routePath,
      `
/show "hello"
/output "world" to "state://greeting"
      `.trim()
    );

    const result = await executeRoute(routePath, undefined, { fileSystem, pathService });

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

    await executeRoute(routePath, undefined, { fileSystem, pathService });
    const second = await executeRoute(routePath, undefined, { fileSystem, pathService });

    const metrics = (second as any).metrics;
    expect(metrics.cacheHit).toBe(true);
    expect(metrics.parseMs).toBe(0);
  });

  it('propagates metrics in stream mode', async () => {
    await fileSystem.writeFile(routePath, '/show "stream"');

    const handle = (await executeRoute(routePath, undefined, {
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

    const handle = (await executeRoute(routePath, undefined, {
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
    await expect(executeRoute('/nope.mlld', undefined, { fileSystem, pathService })).rejects.toBeInstanceOf(ExecuteError);
    await expect(executeRoute('/nope.mlld', undefined, { fileSystem, pathService })).rejects.toMatchObject({
      code: 'ROUTE_NOT_FOUND'
    });
  });

  it('wraps parse errors as ExecuteError', async () => {
    await fileSystem.writeFile(routePath, '/var @oops = {');

    await expect(executeRoute(routePath, undefined, { fileSystem, pathService })).rejects.toMatchObject({
      code: 'PARSE_ERROR'
    });
  });

  it('injects payload and state dynamic modules', async () => {
    await fileSystem.writeFile(routePath, '/show "ok"');

    const result = await executeRoute(
      routePath,
      { text: 'hello' },
      { state: { greeting: 'hi' }, fileSystem, pathService }
    );

    const resolverManager = (result as any).environment?.getResolverManager();
    const dynamicResolver = resolverManager
      ?.getResolversForContext('import')
      ?.find((resolver: any) => resolver.name === 'dynamic');

    expect(dynamicResolver?.canResolve('@payload')).toBe(true);
    expect(dynamicResolver?.canResolve('@state')).toBe(true);

    const payloadModule = await dynamicResolver?.resolve('@payload');
    const stateModule = await dynamicResolver?.resolve('@state');

    expect(payloadModule?.content).toContain('@text = "hello"');
    expect(stateModule?.content).toContain('@greeting = "hi"');
  });
});
