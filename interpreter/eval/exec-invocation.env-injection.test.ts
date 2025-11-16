import { describe, it, expect, beforeEach } from 'vitest';
import { Environment } from '../env/Environment';
import type { ExecInvocation } from '@core/types';
import { evaluateExecInvocation } from './exec-invocation';
import type { IFileSystemService, IPathService } from '@services/index';

describe('ExecInvocation env injection for command executables', () => {
  let env: Environment;

  beforeEach(() => {
    // Minimal env setup with in-memory fs
    const fileSystem: IFileSystemService = {
      readFile: async () => '',
      writeFile: async () => {},
      exists: async () => true,
      mkdir: async () => {},
      readdir: async () => [],
      stat: async () => ({ isDirectory: () => false, isFile: () => true }),
      realpath: async (p: string) => p,
      createVirtualFS: () => ({ readFile: async () => '', writeFile: async () => {} })
    } as any;
    const pathService: IPathService = {
      resolve: (...paths: string[]) => paths.join('/'),
      dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
      basename: (p: string) => p.split('/').pop() || '',
      extname: (p: string) => {
        const parts = p.split('.');
        return parts.length > 1 ? `.${parts.pop()}` : '';
      },
      join: (...paths: string[]) => paths.join('/'),
      isAbsolute: (p: string) => p.startsWith('/'),
      relative: (from: string, to: string) => to,
      normalize: (p: string) => p
    } as any;
    env = new Environment(fileSystem, pathService, '/proj');
  });

  function defineExecCommand(name: string, params: string[], template: string) {
    return (async () => {
      const { createExecutableVariable } = await import('@core/types/variable/VariableFactories');
      const exe = createExecutableVariable(
        name,
        'command',
        undefined as any,
        params,
        undefined as any,
        { directive: 'var', syntax: 'literal', hasInterpolation: false, isMultiLine: false },
        {
          executableDef: {
            type: 'command',
            paramNames: params,
            commandTemplate: [{ type: 'Text', content: template }]
          }
        }
      );
      env.setVariable(name, exe);
    })();
  }

  it('does not inject env for unused params in {} command', async () => {
    await defineExecCommand('constant', ['big'], 'echo "constant"');

    // Spy at executor level to capture options.env across child envs
    const { ShellCommandExecutor } = await import('../env/executors/ShellCommandExecutor');
    const original = ShellCommandExecutor.prototype.execute;
    let capturedEnv: Record<string, string> | undefined;
    let called = 0;
    ShellCommandExecutor.prototype.execute = async function(command: string, options?: any) {
      called++;
      capturedEnv = options?.env;
      return 'constant';
    } as any;

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: [{ type: 'VariableReference', identifier: 'constant' }],
        args: [{ type: 'Text', content: 'X'.repeat(100000) }]
      }
    } as any;

    // Sanity: executable def present
    expect(((env as any).getVariable('constant') as any).internal?.executableDef).toBeDefined();
    const res = await evaluateExecInvocation(invocation, env);
    expect(capturedEnv && Object.keys(capturedEnv).length).toBe(0); // no env injected
    expect(called).toBeGreaterThan(0); // ensure command path executed

    ShellCommandExecutor.prototype.execute = original;
  });

  it('injects env only for params referenced as $name or ${name}', async () => {
    await defineExecCommand('usesEnv', ['data', 'unused'], 'echo "$data" ${data}');

    const { ShellCommandExecutor } = await import('../env/executors/ShellCommandExecutor');
    const original = ShellCommandExecutor.prototype.execute;
    let capturedEnv: Record<string, string> | undefined;
    let called = 0;
    ShellCommandExecutor.prototype.execute = async function(command: string, options?: any) {
      called++;
      capturedEnv = options?.env;
      return 'ok';
    } as any;

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: [{ type: 'VariableReference', identifier: 'usesEnv' }],
        args: [
          { type: 'Text', content: 'hello' },
          { type: 'Text', content: 'ignored' }
        ]
      }
    } as any;

    // Sanity: executable def present
    expect(((env as any).getVariable('usesEnv') as any).internal?.executableDef).toBeDefined();
    const res = await evaluateExecInvocation(invocation, env);
    expect(capturedEnv).toBeDefined();
    expect(Object.keys(capturedEnv!)).toEqual(['data']);
    expect(capturedEnv!.data).toBe('hello');
    expect(called).toBeGreaterThan(0);

    ShellCommandExecutor.prototype.execute = original;
  });

  // Note: fallback to bash heredoc for {} templates is covered via e2e in scripts/test-heredoc.cjs
});
