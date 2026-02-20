import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from '@grammar/parser';
import type { PipelineCommand, VariableSource } from '@core/types';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import type { OperationContext, PipelineContextSnapshot } from '@interpreter/env/ContextManager';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { createSimpleTextVariable } from '@core/types/variable';
import { asText, isStructuredValue, wrapStructured } from '@interpreter/utils/structured-value';
import { GuardError } from '@core/errors/GuardError';
import { GuardRetrySignal } from '@core/errors/GuardRetrySignal';
import { executeCommandVariable, resolveCommandReference } from './command-execution';
import { AutoUnwrapManager } from '@interpreter/eval/auto-unwrap-manager';

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

function setPipelineContext(
  env: Environment,
  overrides?: Partial<PipelineContextSnapshot>
): void {
  env.setPipelineContext({
    stage: 1,
    totalStages: 1,
    currentCommand: 'stage',
    input: 'seed',
    previousOutputs: [],
    attemptCount: 1,
    attemptHistory: [],
    hint: null,
    hintHistory: [],
    sourceRetryable: true,
    guards: [],
    ...(overrides ?? {})
  });
}

function buildHookNode(): any {
  return {
    type: 'ExecInvocation',
    commandRef: {
      type: 'CommandReference',
      identifier: 'probe',
      args: []
    }
  };
}

function buildOperationContext(): OperationContext {
  return {
    type: 'exe',
    name: 'probe',
    opLabels: ['op:exe']
  };
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

async function runCommand(
  commandVar: any,
  args: any[],
  env: Environment,
  stdinInput?: string,
  structuredInput?: Parameters<typeof executeCommandVariable>[4],
  hookOptions?: Parameters<typeof executeCommandVariable>[5]
) {
  return AutoUnwrapManager.executeWithPreservation(() =>
    executeCommandVariable(commandVar, args, env, stdinInput, structuredInput, hookOptions)
  );
}

describe('command-execution phase-0 characterization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes command branches with first-parameter @input binding', async () => {
    const env = createEnv();
    await evaluateSource(
      '/exe @run(input, extra, tail) = cmd { printf "%s|%s|%s" "@input" "@extra" "@tail" }',
      env
    );

    const commandVar = getExecutableVariable(env, 'run');
    const executeCommandSpy = vi.spyOn(env, 'executeCommand').mockResolvedValue('ok-from-command');
    setPipelineContext(env);

    const result = await runCommand(commandVar, ['ARG-B', 'ARG-C'], env, 'PIPE-IN');

    expect(executeCommandSpy).toHaveBeenCalledTimes(1);
    const [command, options] = executeCommandSpy.mock.calls[0];
    expect(command).toContain('PIPE-IN');
    expect(command).toContain('ARG-B');
    expect(command).toContain('ARG-C');
    expect((options as { input?: string } | undefined)?.input).toBe('PIPE-IN');
    expect(asText(result)).toBe('ok-from-command');
  });

  it('routes command execution through provider config when provider is scoped', async () => {
    const env = createEnv();
    await evaluateSource('/exe @run(input) = cmd { printf "%s" "@input" }', env);

    const providerRef = registerProvider(env);
    env.setScopedEnvironmentConfig({ provider: providerRef, name: 'suite-env' });

    const commandVar = getExecutableVariable(env, 'run');
    const executeCommandSpy = vi.spyOn(env, 'executeCommand');
    setPipelineContext(env);

    const result = await runCommand(commandVar, [], env, 'PIPE-IN');

    expect(executeCommandSpy).not.toHaveBeenCalled();
    expect(asText(result)).toContain('provider:suite-env:sh -lc');
    expect(asText(result)).toContain('printf');
  });

  it('auto-parses JSON pipeline input for code branches and preserves text fallback hooks', async () => {
    const env = createEnv();
    await evaluateSource('/exe @inspect(input, extra) = js { return "noop" }', env);

    const commandVar = getExecutableVariable(env, 'inspect');
    let capturedParams: Record<string, unknown> | undefined;

    vi.spyOn(env, 'executeCode').mockImplementation(async (_code, _language, params) => {
      capturedParams = params;
      return 'captured';
    });

    setPipelineContext(env);
    await runCommand(commandVar, ['ARG-EXTRA'], env, '{"count":5}');

    expect(capturedParams).toBeTruthy();
    const input = capturedParams?.input as Record<string, unknown> & { trim?: () => string };
    expect(typeof input).toBe('object');
    expect((input as { count?: number }).count).toBe(5);
    expect(input.text).toBe('{"count":5}');
    expect(input.raw).toBe('{"count":5}');
    expect(input.trim?.()).toBe('{"count":5}');
    expect(capturedParams?.extra).toBe('ARG-EXTRA');
  });

  it('keeps native structured inputs on @input while preserving explicit arg binding', async () => {
    const env = createEnv();
    await evaluateSource('/exe @inspect(input, extra) = js { return "noop" }', env);

    const commandVar = getExecutableVariable(env, 'inspect');
    let capturedParams: Record<string, unknown> | undefined;

    vi.spyOn(env, 'executeCode').mockImplementation(async (_code, _language, params) => {
      capturedParams = params;
      return 'captured';
    });

    setPipelineContext(env);
    const structuredInput = wrapStructured({ count: 9 }, 'object', '{"count":9}');
    await runCommand(commandVar, ['ARG-EXTRA'], env, 'PIPE-INPUT', structuredInput);

    expect(capturedParams).toBeTruthy();
    expect(capturedParams?.input).toEqual({ count: 9 });
    expect(capturedParams?.extra).toBe('ARG-EXTRA');
  });

  it('propagates policy output descriptors on code branch outputs', async () => {
    const env = createEnv();
    await evaluateSource('/exe @llmStage(input) = js { return "policy-result" }', env);

    env.recordPolicyConfig('test-policy', {
      defaults: {
        rules: ['untrusted-llms-get-influenced']
      }
    });

    const upstream = createSimpleTextVariable('input', 'tainted-input', TEXT_SOURCE, {
      mx: {
        labels: ['untrusted'],
        taint: ['untrusted'],
        sources: ['src:test'],
        policy: null
      }
    });
    env.setVariable('input', upstream);

    const commandVar = getExecutableVariable(env, 'llmStage');
    commandVar.mx = {
      ...(commandVar.mx ?? {}),
      labels: ['llm'],
      taint: [],
      sources: [],
      policy: null,
      name: commandVar.name,
      type: commandVar.type
    };

    vi.spyOn(env, 'executeCode').mockResolvedValue('policy-result');
    setPipelineContext(env);

    const result = await runCommand(commandVar, [], env, 'PIPE-IN');

    expect(isStructuredValue(result)).toBe(true);
    expect(result.mx?.labels ?? []).toEqual(expect.arrayContaining(['influenced']));
  });

  it('executes nodeFunction branch and wraps output consistently', async () => {
    const env = createEnv();
    setPipelineContext(env);

    const commandVar = {
      type: 'executable',
      name: 'nodeFn',
      value: {
        type: 'code',
        template: ''
      },
      paramNames: ['input'],
      internal: {
        executableDef: {
          type: 'nodeFunction',
          fn: (input: unknown) => ({ value: String(input), source: 'node' }),
          paramNames: ['input'],
          sourceDirective: 'exec'
        }
      }
    };

    const result = await runCommand(commandVar, [], env, 'PIPE-IN');

    expect(isStructuredValue(result)).toBe(true);
    expect(result.type).toBe('object');
    expect(result.data).toMatchObject({ value: 'PIPE-IN', source: 'node' });
  });

  it('executes template branch with interpolated pipeline input', async () => {
    const env = createEnv();
    setPipelineContext(env);

    const commandVar = {
      type: 'executable',
      name: 'templateStage',
      value: {
        type: 'data',
        template: ''
      },
      paramNames: ['input'],
      internal: {
        executableDef: {
          type: 'template',
          paramNames: ['input'],
          template: [
            { type: 'Text', content: 'template:' },
            { type: 'VariableReference', identifier: 'input', fields: [] }
          ]
        }
      }
    };

    const result = await runCommand(commandVar, [], env, 'PIPE-IN');
    expect(result).toBe('template:PIPE-IN');
  });

  it('executes commandRef branch by resolving and invoking referenced executable', async () => {
    const env = createEnv();
    setPipelineContext(env);

    const inner = {
      type: 'executable',
      name: 'innerExec',
      value: {
        type: 'data',
        template: ''
      },
      paramNames: ['input'],
      internal: {
        executableDef: {
          type: 'template',
          paramNames: ['input'],
          template: [
            { type: 'Text', content: 'inner:' },
            { type: 'VariableReference', identifier: 'input', fields: [] }
          ]
        }
      }
    };

    env.setVariable('innerExec', inner as any);

    const outer = {
      type: 'executable',
      name: 'outerExec',
      value: {
        type: 'data',
        template: ''
      },
      paramNames: ['input'],
      internal: {
        executableDef: {
          type: 'commandRef',
          commandRef: 'innerExec',
          commandArgs: []
        }
      }
    };

    const result = await runCommand(outer, [], env, 'PIPE-IN');
    expect(result).toBe('inner:PIPE-IN');
  });

  it('captures guard preflight denial outcomes before execution', async () => {
    const env = createEnv();
    await evaluateSource('/exe @guarded(input) = js { return "ok" }', env);

    const commandVar = getExecutableVariable(env, 'guarded');
    env.getHookManager().registerPre(async () => ({
      action: 'deny',
      metadata: {
        guardName: 'guarded-deny',
        guardFilter: 'op:exe',
        reason: 'blocked in preflight'
      }
    }));

    setPipelineContext(env);

    await expect(
      runCommand(commandVar, [], env, 'PIPE-IN', undefined, {
        hookNode: buildHookNode(),
        operationContext: buildOperationContext(),
        stageInputs: []
      })
    ).rejects.toMatchObject({
      decision: 'deny',
      reason: 'blocked in preflight'
    });
  });

  it('preserves guard retry signal shape and non-retryable fallback behavior', async () => {
    const makeRetryHook = () =>
      async () => ({
        action: 'retry' as const,
        metadata: {
          guardName: 'guarded-retry',
          guardFilter: 'op:exe',
          reason: 'retry-requested',
          hint: { branch: 'retry' }
        }
      });

    const retryableEnv = createEnv();
    await evaluateSource('/exe @guarded(input) = js { return "ok" }', retryableEnv);
    const retryableCommand = getExecutableVariable(retryableEnv, 'guarded');
    retryableEnv.getHookManager().registerPre(makeRetryHook());
    setPipelineContext(retryableEnv, { sourceRetryable: true });

    let retryableError: unknown;
    try {
      await runCommand(retryableCommand, [], retryableEnv, 'PIPE-IN', undefined, {
        hookNode: buildHookNode(),
        operationContext: buildOperationContext(),
        stageInputs: []
      });
    } catch (error) {
      retryableError = error;
    }

    expect(retryableError).toBeInstanceOf(GuardRetrySignal);
    expect((retryableError as GuardRetrySignal).decision).toBe('retry');
    expect((retryableError as GuardRetrySignal).reason).toBe('retry-requested');

    const nonRetryableEnv = createEnv();
    await evaluateSource('/exe @guarded(input) = js { return "ok" }', nonRetryableEnv);
    const nonRetryableCommand = getExecutableVariable(nonRetryableEnv, 'guarded');
    nonRetryableEnv.getHookManager().registerPre(makeRetryHook());
    setPipelineContext(nonRetryableEnv, { sourceRetryable: false });

    let nonRetryableError: unknown;
    try {
      await runCommand(nonRetryableCommand, [], nonRetryableEnv, 'PIPE-IN', undefined, {
        hookNode: buildHookNode(),
        operationContext: buildOperationContext(),
        stageInputs: []
      });
    } catch (error) {
      nonRetryableError = error;
    }

    expect(nonRetryableError).toBeInstanceOf(GuardError);
    expect((nonRetryableError as GuardError).decision).toBe('deny');
    expect((nonRetryableError as GuardError).reason ?? '').toContain('Cannot retry');
  });

  it('returns mlld-when retry objects unchanged to preserve retry payload shape', async () => {
    const env = createEnv();
    await evaluateSource('/exe @retryer(input) = when [ * => retry { reason: "again" } ]', env);
    const commandVar = getExecutableVariable(env, 'retryer');

    setPipelineContext(env);
    const result = await runCommand(commandVar, [], env, 'PIPE-IN');

    expect(result).toEqual({ value: 'retry', hint: { reason: 'again' } });
  });

  it('resolves executable references and nested fields in resolveCommandReference', async () => {
    const env = createEnv();
    await evaluateSource('/exe @stage(input) = js { return input }\n/var @obj = { "nested": { "value": 7 } }', env);

    const resolvedExecutable = await resolveCommandReference(
      {
        rawIdentifier: 'stage',
        identifier: [{ type: 'VariableReference', identifier: 'stage', fields: [] } as any],
        args: [],
        rawArgs: []
      } as PipelineCommand,
      env
    );

    expect(resolvedExecutable?.type).toBe('executable');

    const resolvedFieldValue = await resolveCommandReference(
      {
        rawIdentifier: 'obj.nested.value',
        identifier: [
          {
            type: 'VariableReference',
            identifier: 'obj',
            fields: [
              { type: 'field', value: 'nested' },
              { type: 'field', value: 'value' }
            ]
          } as any
        ],
        args: [],
        rawArgs: []
      } as PipelineCommand,
      env
    );

    expect(resolvedFieldValue).toBe(7);
  });
});
