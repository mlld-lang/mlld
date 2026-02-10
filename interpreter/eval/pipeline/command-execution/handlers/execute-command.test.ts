import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from '@grammar/parser';
import type { VariableSource } from '@core/types/variable';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { wrapExecResult } from '@interpreter/utils/structured-exec';
import { normalizeExecutableDescriptor } from '../normalize-executable';
import { executeCommandHandler } from './execute-command';

const { processPipelineMock } = vi.hoisted(() => ({
  processPipelineMock: vi.fn()
}));

vi.mock('@interpreter/eval/pipeline/unified-processor', () => ({
  processPipeline: processPipelineMock
}));

const TEXT_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'quoted',
  hasInterpolation: false,
  isMultiLine: false
};

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

async function evaluateSource(source: string, env: Environment): Promise<void> {
  const { ast } = await parse(source);
  await evaluate(ast, env);
}

function getExecutableVariable(env: Environment, name: string): any {
  const variable = env.getVariable(name);
  expect(variable).toBeTruthy();
  expect(variable?.type).toBe('executable');
  return variable as any;
}

function setInputParam(execEnv: Environment, value: string): void {
  const inputVar = createSimpleTextVariable('input', value, TEXT_SOURCE, {
    internal: {
      isSystem: true,
      isParameter: true
    }
  });
  execEnv.setParameterVariable('input', inputVar);
}

function registerProvider(env: Environment): string {
  const providerRef = '@mock/provider';
  const moduleSource = `
/exe @create(opts) = node {
  return { envName: opts?.name || 'env-default', created: true };
}

/exe @execute(envName, command) = node {
  return {
    stdout: 'provider:' + String(envName) + ':' + (command?.argv || []).join(' '),
    stderr: '',
    exitCode: 0
  };
}

/exe @release(envName) = node {
  return '';
}

/export { @create, @execute, @release }
`;

  env.registerDynamicModules({ [providerRef]: moduleSource }, { source: 'test' });
  return providerRef;
}

describe('executeCommandHandler extraction parity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    processPipelineMock.mockReset();
  });

  it('executes direct command path and preserves descriptor merge behavior', async () => {
    const env = createEnv();
    await evaluateSource('/exe @run(input) = cmd { printf "%s" "@input" }', env);
    const commandVar = getExecutableVariable(env, 'run');
    const { execDef } = normalizeExecutableDescriptor(commandVar);
    const execEnv = env.createChild();
    setInputParam(execEnv, 'PIPE-IN');
    const executeCommandSpy = vi.spyOn(env, 'executeCommand').mockResolvedValue('ok-from-command');

    const result = await executeCommandHandler({
      env,
      execEnv,
      execDef,
      commandVar,
      stdinInput: 'PIPE-IN',
      outputPolicyDescriptor: makeSecurityDescriptor({ labels: ['policy-label'] }),
      finalizeResult: value => wrapExecResult(value)
    });

    expect(executeCommandSpy).toHaveBeenCalledTimes(1);
    expect(asText(result.value as any)).toBe('ok-from-command');
    expect(isStructuredValue(result.value)).toBe(true);
    expect((result.value as any).mx?.labels ?? []).toEqual(expect.arrayContaining(['policy-label']));
    expect((result.value as any).mx?.taint ?? []).toEqual(expect.arrayContaining(['src:exec']));
  });

  it('executes provider command path and preserves direct/provider parity contract', async () => {
    const env = createEnv();
    await evaluateSource('/exe @run(input) = cmd { printf "%s" "@input" }', env);
    const commandVar = getExecutableVariable(env, 'run');
    const { execDef } = normalizeExecutableDescriptor(commandVar);
    const providerRef = registerProvider(env);
    env.setScopedEnvironmentConfig({ provider: providerRef, name: 'suite-env' });
    const execEnv = env.createChild();
    setInputParam(execEnv, 'PIPE-IN');
    const executeCommandSpy = vi.spyOn(env, 'executeCommand');

    const result = await executeCommandHandler({
      env,
      execEnv,
      execDef,
      commandVar,
      stdinInput: 'PIPE-IN',
      finalizeResult: value => wrapExecResult(value)
    });

    expect(executeCommandSpy).not.toHaveBeenCalled();
    expect(asText(result.value as any)).toContain('provider:suite-env:sh -lc');
    expect(asText(result.value as any)).toContain('printf');
  });

  it('chains nested with-clause pipeline output through processPipeline', async () => {
    const env = createEnv();
    await evaluateSource('/exe @run(input) = cmd { printf "%s" "@input" }', env);
    const commandVar = getExecutableVariable(env, 'run');
    const { execDef } = normalizeExecutableDescriptor(commandVar);
    execDef.withClause = { pipeline: [{}], format: 'text' };
    const execEnv = env.createChild();
    setInputParam(execEnv, 'PIPE-IN');
    vi.spyOn(env, 'executeCommand').mockResolvedValue('raw-command-output');
    processPipelineMock.mockResolvedValue('processed-output');

    const result = await executeCommandHandler({
      env,
      execEnv,
      execDef,
      commandVar,
      stdinInput: 'PIPE-IN',
      finalizeResult: value => wrapExecResult(value)
    });

    expect(processPipelineMock).toHaveBeenCalledTimes(1);
    expect(asText(result.value as any)).toBe('processed-output');
    expect(result.retrySignal).toBeUndefined();
  });

  it('preserves retry signal propagation from nested with-clause pipelines', async () => {
    const env = createEnv();
    await evaluateSource('/exe @run(input) = cmd { printf "%s" "@input" }', env);
    const commandVar = getExecutableVariable(env, 'run');
    const { execDef } = normalizeExecutableDescriptor(commandVar);
    execDef.withClause = { pipeline: [{}], format: 'text' };
    const execEnv = env.createChild();
    setInputParam(execEnv, 'PIPE-IN');
    vi.spyOn(env, 'executeCommand').mockResolvedValue('raw-command-output');
    const retrySignal = { value: 'retry', hint: { reason: 'again' } };
    processPipelineMock.mockResolvedValue(retrySignal);

    const result = await executeCommandHandler({
      env,
      execEnv,
      execDef,
      commandVar,
      stdinInput: 'PIPE-IN',
      finalizeResult: value => wrapExecResult(value)
    });

    expect(result.retrySignal).toEqual(retrySignal);
    expect(result.value).toEqual(retrySignal);
  });
});
