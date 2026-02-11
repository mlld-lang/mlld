import { describe, expect, it, vi } from 'vitest';
import { Environment } from './Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';

function createEnvironment(basePath: string = '/tmp/mlld-zones'): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), basePath);
}

describe('Environment zones coverage', () => {
  it('enforces tool-scope narrowing in child environments', () => {
    const parent = createEnvironment('/tmp/mlld-zones/parent');
    parent.setAllowedTools(['alpha', 'beta']);

    const child = parent.createChild('/tmp/mlld-zones/child');

    expect(() => child.setAllowedTools(['alpha'])).not.toThrow();
    expect(() => child.setAllowedTools(['alpha', 'gamma'])).toThrow(/outside parent/i);
    expect(child.isToolAllowed('alpha')).toBe(true);
    expect(child.isToolAllowed('beta')).toBe(false);
  });

  it('records policy config metadata and policy environment in context', () => {
    const env = createEnvironment();

    env.setPolicyContext({ tier: 'strict', activePolicies: ['base'] });
    env.recordPolicyConfig('audit', { defaults: { trustconflict: 'error' } });
    env.setPolicyEnvironment('prod');

    const context = env.getPolicyContext() as any;
    expect(context.tier).toBe('strict');
    expect(context.activePolicies).toEqual(expect.arrayContaining(['base', 'audit']));
    expect(context.environment).toBe('prod');
    expect(context.configs).toBeDefined();
    expect(env.getPolicySummary()).toBeDefined();
  });

  it('tracks state writes and mirrors updates into @state', () => {
    const env = createEnvironment();
    const updateModule = vi.fn();

    (env as any).registerDynamicStateSnapshot(
      { value: 'old', nested: { count: 1 } },
      { updateModule },
      'user-data'
    );

    env.recordStateWrite({ path: 'value', value: 'new', operation: 'set' } as any);
    env.recordStateWrite({ path: 'nested.count', value: 2, operation: 'set' } as any);

    expect(env.getVariable('state')?.value?.value).toBe('new');
    expect((env.getVariable('state') as any)?.value?.nested?.count).toBe(2);
    expect((env.getVariable('state') as any)?.mx?.labels).toEqual(
      expect.arrayContaining(['src:dynamic', 'src:user-data'])
    );
    expect(updateModule).toHaveBeenCalled();

    const writes = env.getStateWrites();
    expect(writes).toHaveLength(2);
    expect(writes[0].index).toBe(0);
    expect(writes[1].index).toBe(1);
  });

  it('maps stream-bus events into SDK events and suppresses chunks when streaming is disabled', () => {
    const env = createEnvironment();
    let listener: ((event: any) => void) | undefined;
    const unsubscribe = vi.fn();
    const bus = {
      subscribe: vi.fn((next: (event: any) => void) => {
        listener = next;
        return unsubscribe;
      })
    };

    env.setStreamingManager({ getBus: () => bus } as any);
    env.setStreamingOptions({ enabled: false });

    const emitter = { emit: vi.fn() };
    env.enableSDKEvents(emitter as any);

    listener?.({
      type: 'CHUNK',
      pipelineId: 'p',
      stageIndex: 0,
      chunk: 'hidden',
      source: 'stdout',
      timestamp: Date.now()
    });
    expect(emitter.emit).not.toHaveBeenCalled();

    listener?.({
      type: 'STAGE_START',
      pipelineId: 'p',
      stageIndex: 1,
      command: { rawIdentifier: 'echo hi' },
      timestamp: Date.now()
    });

    const types = emitter.emit.mock.calls.map(([event]) => event.type);
    expect(types).toContain('stream:progress');
    expect(types).toContain('command:start');

    env.cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('reuses parent node/python shadow environments for child getOrCreate operations', () => {
    const parent = createEnvironment('/tmp/mlld-zones/parent');
    const child = parent.createChild('/tmp/mlld-zones/child');

    const parentNode = parent.getOrCreateNodeShadowEnv();
    const parentPython = parent.getOrCreatePythonShadowEnv();

    expect(child.getOrCreateNodeShadowEnv()).toBe(parentNode);
    expect(child.getOrCreatePythonShadowEnv()).toBe(parentPython);
  });

  it('resolves child path context override and legacy fallback', () => {
    const env = createEnvironment('/tmp/mlld-zones/root');
    (env as any).pathContext = {
      projectRoot: '/tmp/mlld-zones',
      fileDirectory: '/tmp/mlld-zones/root',
      executionDirectory: '/tmp/mlld-zones/root',
      invocationDirectory: '/tmp/mlld-zones'
    };

    const overridden = (env as any).resolveChildContext('/tmp/mlld-zones/child');
    expect(overridden).toMatchObject({
      fileDirectory: '/tmp/mlld-zones/child',
      executionDirectory: '/tmp/mlld-zones/child'
    });

    const inherited = (env as any).resolveChildContext();
    expect(inherited).toBe((env as any).pathContext);

    const legacy = createEnvironment('/tmp/mlld-zones/legacy');
    (legacy as any).pathContext = undefined;
    expect((legacy as any).resolveChildContext('/tmp/mlld-zones/legacy-child')).toBe('/tmp/mlld-zones/legacy-child');
    expect((legacy as any).resolveChildContext()).toBe('/tmp/mlld-zones/legacy');
  });
});
