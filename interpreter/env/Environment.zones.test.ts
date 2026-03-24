import { describe, expect, it, vi } from 'vitest';
import { Environment } from './Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { VirtualFS } from '@services/fs/VirtualFS';
import type { WorkspaceValue } from '@core/types/workspace';

function createEnvironment(basePath: string = '/tmp/mlld-zones'): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), basePath);
}

function createWorkspace(): WorkspaceValue {
  return {
    type: 'workspace',
    fs: VirtualFS.empty(),
    descriptions: new Map<string, string>()
  };
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
    const setModuleFieldLabels = vi.fn();

    (env as any).registerDynamicStateSnapshot(
      { value: 'old', nested: { count: 1 } },
      { updateModule, setModuleFieldLabels },
      'user-data'
    );

    const emitter = { emit: vi.fn() };
    env.enableSDKEvents(emitter as any);

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

    env.applyExternalStateUpdate('value', 'external', ['untrusted']);
    env.applyExternalStateUpdate('nested.count', 3, ['pii']);

    expect(env.getVariable('state')?.value?.value).toBe('external');
    expect((env.getVariable('state') as any)?.value?.nested?.count).toBe(3);
    expect((env.getVariable('state') as any)?.internal?.namespaceMetadata?.value?.security?.labels).toEqual(['untrusted']);
    expect((env.getVariable('state') as any)?.internal?.namespaceMetadata?.nested?.security?.labels).toEqual(['pii']);
    expect(env.getStateWrites()).toHaveLength(2);
    expect(setModuleFieldLabels).toHaveBeenLastCalledWith('@state', {
      value: ['untrusted'],
      nested: ['pii']
    });

    const sdkTypes = emitter.emit.mock.calls.map(([event]) => event.type);
    expect(sdkTypes).toContain('state:write');
  });


  it('rejects external state updates when no dynamic @state snapshot exists', () => {
    const env = createEnvironment();

    expect(() => env.applyExternalStateUpdate('exit', true)).toThrow(
      /No dynamic @state snapshot/i
    );
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

  it('manages workspace stack and copies it for child environments', () => {
    const parent = createEnvironment('/tmp/mlld-zones/root');
    const outer = createWorkspace();
    const inner = createWorkspace();

    expect(parent.getActiveWorkspace()).toBeUndefined();

    parent.pushActiveWorkspace(outer);
    expect(parent.getActiveWorkspace()).toBe(outer);

    const child = parent.createChild('/tmp/mlld-zones/child');
    expect(child.getActiveWorkspace()).toBe(outer);

    child.pushActiveWorkspace(inner);
    expect(child.getActiveWorkspace()).toBe(inner);
    expect(parent.getActiveWorkspace()).toBe(outer);

    expect(child.popActiveWorkspace()).toBe(inner);
    expect(child.getActiveWorkspace()).toBe(outer);
    expect(parent.popActiveWorkspace()).toBe(outer);
    expect(parent.getActiveWorkspace()).toBeUndefined();
  });

  it('creates a workspace ShellSession lazily and routes commands through it', async () => {
    const env = createEnvironment('/tmp/mlld-zones/root');
    const workspace = createWorkspace();

    expect(workspace.shellSession).toBeUndefined();
    env.pushActiveWorkspace(workspace);

    const output = await env.executeCommand('echo "workspace-ok"');
    expect(output).toBe('workspace-ok');
    expect(workspace.shellSession).toBeDefined();

    await env.executeCommand('echo "created by shell" > /tmp/workspace.txt');
    expect(await workspace.fs.readFile('/tmp/workspace.txt')).toContain('created by shell');
  });

  it('switches active shell routing when workspace nesting changes', async () => {
    const env = createEnvironment('/tmp/mlld-zones/root');
    const outer = createWorkspace();
    const inner = createWorkspace();

    await outer.fs.writeFile('/tmp/name.txt', 'outer');
    await inner.fs.writeFile('/tmp/name.txt', 'inner');

    env.pushActiveWorkspace(outer);
    expect(await env.executeCommand('cat /tmp/name.txt')).toBe('outer');

    env.pushActiveWorkspace(inner);
    expect(await env.executeCommand('cat /tmp/name.txt')).toBe('inner');

    env.popActiveWorkspace();
    expect(await env.executeCommand('cat /tmp/name.txt')).toBe('outer');
  });
});
