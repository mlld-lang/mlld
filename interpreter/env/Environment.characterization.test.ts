import { describe, expect, it, vi } from 'vitest';
import { Environment } from './Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { TestEffectHandler } from './EffectHandler';
import { breakIntent } from '@interpreter/output/intent';
import { makeSecurityDescriptor } from '@core/types/security';
import { createSimpleTextVariable } from '@core/types/variable/VariableFactories';

const mockSource = {
  directive: 'var' as const,
  syntax: 'quoted' as const,
  hasInterpolation: false,
  isMultiLine: false
};

function createEnvironment(basePath: string = '/tmp/mlld-characterization'): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), basePath);
}

describe('Environment characterization', () => {
  describe('root/child inheritance and scope boundaries', () => {
    it('inherits reserved names, allowed tools, and policy context while keeping import guard local', async () => {
      const env = createEnvironment();
      await env.registerBuiltinResolvers();
      env.setAllowedTools(['alpha', 'beta']);
      env.setPolicyContext({ tier: 'strict', activePolicies: ['audit'] });
      env.setImporting(true);

      const child = env.createChild('/tmp/mlld-characterization/child');

      expect((child as any).reservedNames.has('debug')).toBe(true);
      expect((child as any).reservedNames.has('input')).toBe(true);
      expect(Array.from(child.getAllowedTools() ?? [])).toEqual(['alpha', 'beta']);
      expect(child.getPolicyContext()).toEqual({
        tier: 'strict',
        activePolicies: ['audit']
      });
      expect(child.getIsImporting()).toBe(false);

      env.setImporting(false);
      child.setImporting(true);
      expect(env.getIsImporting()).toBe(false);
      expect(child.getIsImporting()).toBe(true);
    });

    it('builds child environments with inherited tool scope and independent import resolvers', async () => {
      const env = createEnvironment();
      await env.registerBuiltinResolvers();
      env.setAllowedTools(['alpha']);

      const child = env.createChildEnvironment();

      expect(Array.from(child.getAllowedTools() ?? [])).toEqual(['alpha']);
      expect((child as any).importResolver).not.toBe((env as any).importResolver);
      expect(child.getEffectHandler()).toBe(env.getEffectHandler());
    });
  });

  describe('resolver variable behavior', () => {
    it('returns undefined for non-reserved resolver names', async () => {
      const env = createEnvironment();
      await expect(env.getResolverVariable('notReserved')).resolves.toBeUndefined();
    });

    it('denies direct keychain resolver variable access', async () => {
      const env = createEnvironment();
      (env as any).reservedNames.add('keychain');

      await expect(env.getResolverVariable('keychain')).rejects.toThrow(
        'Direct keychain access is not available'
      );
    });

    it('resolves and caches reserved resolver variables once', async () => {
      const env = createEnvironment();
      (env as any).reservedNames.add('cached');
      const resolve = vi.fn().mockResolvedValue({
        content: {
          content: '{"value": 42}',
          contentType: 'data',
          metadata: { source: 'resolver:test' }
        }
      });
      (env as any).resolverManager = { resolve };

      const first = await env.getResolverVariable('cached');
      const second = await env.getResolverVariable('cached');

      expect(resolve).toHaveBeenCalledTimes(1);
      expect(second).toBe(first);
      expect(first?.internal?.needsResolution).toBe(false);
      expect((first as any)?.value?.value).toBe(42);
    });

    it('supports reserved @debug and @input resolver behavior', async () => {
      const env = createEnvironment();
      await env.registerBuiltinResolvers();
      env.setStdinContent('{"requestId":"r-123","payload":{"ok":true}}');

      const debugVar = await env.getResolverVariable('debug');
      const inputVar = await env.getResolverVariable('input');
      const inputVarCached = await env.getResolverVariable('input');

      expect(debugVar?.name).toBe('debug');
      expect(typeof debugVar?.value).toBe('string');
      expect((debugVar?.value as string)).toContain('### Environment variables:');

      expect(inputVar?.name).toBe('input');
      expect((inputVar as any)?.value?.requestId).toBe('r-123');
      expect((inputVar as any)?.value?.payload?.ok).toBe(true);
      expect(inputVarCached).toBe(inputVar);
    });
  });

  describe('effect emission behavior', () => {
    it('suppresses doc effects during import and flushes pending breaks before content', () => {
      const env = createEnvironment();
      const handler = new TestEffectHandler();
      env.setEffectHandler(handler);

      env.setImporting(true);
      env.emitEffect('doc', 'hidden');
      expect(handler.getEffects()).toHaveLength(0);

      env.setImporting(false);
      env.emitIntent(breakIntent('\n'));
      env.emitEffect('doc', 'visible');

      const effects = handler.getEffects();
      expect(effects).toHaveLength(2);
      expect(effects[0].type).toBe('doc');
      expect(effects[0].content).toBe('\n');
      expect(effects[1].type).toBe('doc');
      expect(effects[1].content).toBe('visible');
    });

    it('attaches effect capability context from active security snapshot', () => {
      const env = createEnvironment();
      const handler = new TestEffectHandler();
      env.setEffectHandler(handler);
      env.pushSecurityContext({
        descriptor: makeSecurityDescriptor({ labels: ['secret'], sources: ['test'] }),
        kind: 'command',
        operation: { type: 'run', target: 'echo hi' }
      });

      env.emitEffect('doc', 'secure output');

      const effect = handler.getEffects()[0];
      expect(effect.capability).toBeDefined();
      expect(effect.capability?.kind).toBe('effect');
      expect(effect.capability?.security.labels).toContain('secret');
      expect(effect.capability?.security.sources).toContain('test');
      expect(effect.capability?.metadata).toEqual({
        effectType: 'doc',
        path: undefined
      });

      env.popSecurityContext();
    });
  });

  describe('command/code execution wrappers', () => {
    it('merges output options for command execution and injects stream bus into context', async () => {
      const env = createEnvironment();
      const executeCommand = vi.fn().mockResolvedValue('ok');
      const executeCode = vi.fn().mockResolvedValue('ok');
      (env as any).commandExecutorFactory = {
        executeCommand,
        executeCode
      };
      env.setOutputOptions({ timeout: 100, errorBehavior: 'continue' });

      await env.executeCommand(
        'echo hello',
        { timeout: 250, maxOutputLines: 10 },
        { directiveType: 'run' } as any
      );

      expect(executeCommand).toHaveBeenCalledTimes(1);
      const [command, options, context] = executeCommand.mock.calls[0];
      expect(command).toBe('echo hello');
      expect(options).toMatchObject({
        timeout: 250,
        maxOutputLines: 10,
        errorBehavior: 'continue'
      });
      expect(context.directiveType).toBe('run');
      expect(context.bus).toBeDefined();
    });

    it('injects ambient mx into js/node code execution and leaves python untouched', async () => {
      const env = createEnvironment();
      const executeCommand = vi.fn().mockResolvedValue('ok');
      const executeCode = vi.fn().mockResolvedValue('ok');
      (env as any).commandExecutorFactory = {
        executeCommand,
        executeCode
      };

      await env.executeCode('return 1;', 'js', {});
      await env.executeCode('return 2;', 'node', {});
      await env.executeCode('print("x")', 'python', {});
      await env.executeCode('return 3;', 'javascript', { mx: { forced: true } });

      const jsCall = executeCode.mock.calls[0];
      const nodeCall = executeCode.mock.calls[1];
      const pythonCall = executeCode.mock.calls[2];
      const jsOverrideCall = executeCode.mock.calls[3];

      expect(jsCall[2].mx).toBeDefined();
      expect(nodeCall[2].mx).toBeDefined();
      expect(pythonCall[2].mx).toBeUndefined();
      expect(jsOverrideCall[2].mx).toEqual({ forced: true });
    });
  });

  describe('child creation and merge behavior', () => {
    it('applies createChild path overrides and policy/tool inheritance', () => {
      const env = createEnvironment('/tmp/mlld-characterization/root');
      env.setAllowedTools(['alpha']);
      env.setPolicyContext({ tier: 'strict' });

      const child = env.createChild('/tmp/mlld-characterization/child');

      expect(child.getExecutionDirectory()).toBe('/tmp/mlld-characterization/child');
      expect(Array.from(child.getAllowedTools() ?? [])).toEqual(['alpha']);
      expect(child.getPolicyContext()).toEqual({ tier: 'strict' });
    });

    it('merges child variables and nodes while excluding block-scoped bindings', () => {
      const env = createEnvironment();
      const child = env.createChild();
      const visible = createSimpleTextVariable('visible', 'yes', mockSource);
      const letScoped = createSimpleTextVariable('letScoped', 'no', mockSource);
      const paramScoped = createSimpleTextVariable('paramScoped', 'no', mockSource);
      (letScoped.mx as any).importPath = 'let';
      (paramScoped.mx as any).importPath = 'exe-param';

      child.setVariable('visible', visible);
      child.setVariable('letScoped', letScoped);
      child.setVariable('paramScoped', paramScoped);
      child.addNode({ type: 'Text', content: 'child-node' } as any);

      env.mergeChild(child);

      expect(env.getVariable('visible')?.value).toBe('yes');
      expect(env.getVariable('letScoped')).toBeUndefined();
      expect(env.getVariable('paramScoped')).toBeUndefined();
      expect(env.getNodes().some((node: any) => node.content === 'child-node')).toBe(true);
    });
  });

  describe('cleanup behavior', () => {
    it('cleans shadow envs, stream bridge wiring, and tracked child environments', () => {
      const env = createEnvironment();
      const child = env.createChild('/tmp/mlld-characterization/child');
      child.setShadowEnv('js', new Map([['f', () => 'child']]));
      env.setShadowEnv('js', new Map([['f', () => 'root']]));
      env.setShadowEnv('node', new Map([['n', () => 'root-node']]));

      const unsubscribe = vi.fn();
      const bus = {
        subscribe: vi.fn().mockReturnValue(unsubscribe)
      };
      env.setStreamingManager({ getBus: () => bus } as any);
      env.enableSDKEvents({ emit: vi.fn() } as any);

      const envAny = env as any;
      const childAny = child as any;
      expect(envAny.childEnvironments.size).toBe(1);
      expect(envAny.shadowEnvs.size).toBeGreaterThan(0);
      expect(envAny.nodeShadowEnv).toBeDefined();

      env.cleanup();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(envAny.childEnvironments.size).toBe(0);
      expect(envAny.shadowEnvs.size).toBe(0);
      expect(envAny.nodeShadowEnv).toBeUndefined();
      expect(childAny.shadowEnvs.size).toBe(0);
    });
  });
});
