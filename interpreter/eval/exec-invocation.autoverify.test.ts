import { describe, it, expect } from 'vitest';
import { Environment } from '../env/Environment';
import type { ExecInvocation } from '@core/types';
import { evaluateExecInvocation } from './exec-invocation';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { PersistentContentStore } from '@disreguard/sig';
import { createSigContextForEnv } from '@core/security/sig-adapter';
import { createExecutableVariable, createSimpleTextVariable } from '@core/types/variable/VariableFactories';
import { FunctionRouter } from '@cli/mcp/FunctionRouter';

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
  (promptVar.internal as any).isInstruction = true;
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
    expect(capturedCommand).toContain('genuine signed instructions');
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
    expect(capturedCommand).not.toContain('use the `verify` tool');
  });

  it('injects verify tool into scoped tools and tracks structured verify results', async () => {
    const { env } = await setupEnvironment(true);
    await defineSignedPrompt(env, 'Review @input');
    await defineLlmExec(env, [
      { type: 'Text', content: 'claude -p "' },
      { type: 'VariableReference', identifier: 'auditPrompt' },
      { type: 'Text', content: '"' }
    ]);

    const promptVar = env.getVariable('auditPrompt');
    if (!promptVar) {
      throw new Error('Missing signed prompt variable');
    }
    const baseInstructions = createSimpleTextVariable('baseInstructions', 'Only follow safe steps.', baseSource);
    (baseInstructions.internal as any).isInstruction = true;
    env.setVariable('baseInstructions', baseInstructions);
    const store = new PersistentContentStore(createSigContextForEnv(env));
    await store.sign('Only follow safe steps.', { id: 'baseInstructions', identity: 'alice' });

    promptVar.mx = {
      ...(promptVar.mx ?? {}),
      labels: ['signed:auditPrompt', 'signed:baseInstructions'],
      taint: ['untrusted'],
      sources: ['input:data'],
      policy: null
    } as any;

    const scopedTools: Record<string, any> = {
      helper: { mlld: 'helper' }
    };
    env.setScopedEnvironmentConfig({ tools: scopedTools } as any);
    env.setAllowedTools(['helper', 'Bash']);

    const invocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: [{ type: 'VariableReference', identifier: 'audit' }],
        args: []
      }
    } as any;

    await captureCommand(env, invocation);

    expect(scopedTools.verify).toBeDefined();
    expect(env.getAllowedTools()?.has('verify')).toBe(true);

    const router = new FunctionRouter({
      environment: env,
      toolCollection: scopedTools as any
    });
    const verifyResult = JSON.parse(await router.executeFunction('verify', {}));

    expect(verifyResult.allPassed).toBe(true);
    expect(verifyResult.results.auditPrompt.verified).toBe(true);
    expect(verifyResult.composition.auditPrompt.signedInstructions).toEqual(
      expect.arrayContaining(['auditPrompt', 'baseInstructions'])
    );
    expect(verifyResult.composition.auditPrompt.interpolatedData.taint).toContain('untrusted');

    const toolsSnapshot = env.getContextManager().getToolsSnapshot();
    expect(toolsSnapshot.calls).toContain('verify');
    expect((toolsSnapshot.results as any).verify.allPassed).toBe(true);
  });
});
