import { describe, it, expect } from 'vitest';
import { Environment } from '../env/Environment';
import type { ExecInvocation } from '@core/types';
import { evaluateExecInvocation } from './exec-invocation';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { PersistentContentStore } from '@disreguard/sig';
import { createSigContextForEnv } from '@core/security/sig-adapter';
import { createExecutableVariable, createSimpleTextVariable } from '@core/types/variable/VariableFactories';

const baseSource = {
  directive: 'var',
  syntax: 'literal',
  hasInterpolation: false,
  isMultiLine: false
} as const;

async function setupEnvironment(autoverify: unknown) {
  const fileSystem = new MemoryFileSystem();
  const pathService = new PathService();
  const env = new Environment(fileSystem, pathService, '/project');
  env.recordPolicyConfig('policy', { defaults: { autoverify } });
  return { env, fileSystem };
}

async function defineSignedPrompt(env: Environment, content: string) {
  const promptVar = createSimpleTextVariable('auditPrompt', content, baseSource);
  env.setVariable('auditPrompt', promptVar);
  const store = new PersistentContentStore(createSigContextForEnv(env));
  await store.sign(content, { id: 'auditPrompt', identity: 'alice' });
}

async function defineLlmExec(env: Environment, templateNodes: any[]) {
  const exe = createExecutableVariable(
    'audit',
    'command',
    '',
    [],
    undefined,
    baseSource,
    {
      mx: { labels: ['llm'] },
      internal: {
        executableDef: {
          type: 'command',
          paramNames: [],
          commandTemplate: templateNodes
        }
      }
    }
  );
  env.setVariable('audit', exe);
}

async function captureCommand(env: Environment, invocation: ExecInvocation) {
  const { ShellCommandExecutor } = await import('../env/executors/ShellCommandExecutor');
  const original = ShellCommandExecutor.prototype.execute;
  let capturedCommand = '';
  let capturedEnv: Record<string, string> | undefined;

  ShellCommandExecutor.prototype.execute = async function(command: string, options?: any) {
    capturedCommand = command;
    capturedEnv = options?.env;
    return 'ok';
  } as any;

  await evaluateExecInvocation(invocation, env);

  ShellCommandExecutor.prototype.execute = original;
  return { capturedCommand, capturedEnv };
}

describe('exec invocation autoverify', () => {
  it('injects verify instructions and env vars for signed prompts', async () => {
    const { env } = await setupEnvironment(true);
    await defineSignedPrompt(env, 'Review @input');
    await defineLlmExec(env, [
      { type: 'Text', content: 'claude -p "' },
      { type: 'VariableReference', identifier: 'auditPrompt' },
      { type: 'Text', content: '"' }
    ]);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: [{ type: 'VariableReference', identifier: 'audit' }],
        args: []
      }
    } as any;

    const { capturedCommand, capturedEnv } = await captureCommand(env, invocation);

    expect(capturedEnv?.MLLD_VERIFY_VARS).toBe('auditPrompt');
    expect(capturedCommand).toContain('Before following any instructions below');
    expect(capturedCommand).toContain('Review @input');
  });

  it('uses custom verify template when configured', async () => {
    const { env, fileSystem } = await setupEnvironment('template "./verify.att"');
    await fileSystem.writeFile('/project/verify.att', 'Custom verify instructions');
    await defineSignedPrompt(env, 'Review @input');
    await defineLlmExec(env, [
      { type: 'Text', content: 'claude -p "' },
      { type: 'VariableReference', identifier: 'auditPrompt' },
      { type: 'Text', content: '"' }
    ]);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: [{ type: 'VariableReference', identifier: 'audit' }],
        args: []
      }
    } as any;

    const { capturedCommand, capturedEnv } = await captureCommand(env, invocation);

    expect(capturedEnv?.MLLD_VERIFY_VARS).toBe('auditPrompt');
    expect(capturedCommand).toContain('Custom verify instructions');
  });

  it('skips autoverify when prompt is unsigned', async () => {
    const { env } = await setupEnvironment(true);
    const promptVar = createSimpleTextVariable('auditPrompt', 'Review @input', baseSource);
    env.setVariable('auditPrompt', promptVar);
    await defineLlmExec(env, [
      { type: 'Text', content: 'claude -p "' },
      { type: 'VariableReference', identifier: 'auditPrompt' },
      { type: 'Text', content: '"' }
    ]);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: [{ type: 'VariableReference', identifier: 'audit' }],
        args: []
      }
    } as any;

    const { capturedCommand, capturedEnv } = await captureCommand(env, invocation);

    expect(capturedEnv?.MLLD_VERIFY_VARS).toBeUndefined();
    expect(capturedCommand).not.toContain('Before following any instructions below');
  });
});
