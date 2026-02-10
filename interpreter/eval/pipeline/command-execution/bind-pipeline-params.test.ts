import { describe, expect, it } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import type { PipelineContextSnapshot } from '@interpreter/env/ContextManager';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { AutoUnwrapManager } from '@interpreter/eval/auto-unwrap-manager';
import { bindPipelineParameters } from './bind-pipeline-params';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
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

async function bindWithPreservation(
  options: Parameters<typeof bindPipelineParameters>[0]
): Promise<Awaited<ReturnType<typeof bindPipelineParameters>>> {
  return AutoUnwrapManager.executeWithPreservation(() => bindPipelineParameters(options));
}

describe('bindPipelineParameters extraction parity', () => {
  it('keeps bound arguments as final precedence for base parameter slots', async () => {
    const env = createEnv();
    const execEnv = env.createChild();

    await bindWithPreservation({
      env,
      execEnv,
      paramNames: ['second', 'third'],
      baseParamNames: ['first', 'second', 'third'],
      boundArgs: ['BOUND-FIRST'],
      args: ['ARG-SECOND', 'ARG-THIRD']
    });

    expect(execEnv.getVariable('first')?.value).toBe('BOUND-FIRST');
    expect(execEnv.getVariable('second')?.value).toBe('ARG-SECOND');
    expect(execEnv.getVariable('third')?.value).toBe('ARG-THIRD');
  });

  it('preserves missing and extra argument handling with first-parameter @input injection', async () => {
    const env = createEnv();
    setPipelineContext(env);

    const missingExecEnv = env.createChild();
    await bindWithPreservation({
      env,
      execEnv: missingExecEnv,
      paramNames: ['input', 'middle', 'tail'],
      baseParamNames: ['input', 'middle', 'tail'],
      boundArgs: [],
      args: ['ARG-MIDDLE'],
      stdinInput: 'PIPE-IN',
      stageLanguage: 'js'
    });

    expect(missingExecEnv.getVariable('input')?.value).toBe('PIPE-IN');
    expect(missingExecEnv.getVariable('middle')?.value).toBe('ARG-MIDDLE');
    expect(missingExecEnv.getVariable('tail')?.value).toBe('');

    const extraExecEnv = env.createChild();
    await bindWithPreservation({
      env,
      execEnv: extraExecEnv,
      paramNames: ['input', 'middle', 'tail'],
      baseParamNames: ['input', 'middle', 'tail'],
      boundArgs: [],
      args: ['ARG-MIDDLE', 'ARG-TAIL', 'ARG-EXTRA'],
      stdinInput: 'PIPE-IN',
      stageLanguage: 'js'
    });

    expect(extraExecEnv.getVariable('input')?.value).toBe('PIPE-IN');
    expect(extraExecEnv.getVariable('middle')?.value).toBe('ARG-MIDDLE');
    expect(extraExecEnv.getVariable('tail')?.value).toBe('ARG-TAIL');
    expect(extraExecEnv.getVariable('fourth')).toBeUndefined();
  });

  it('wraps first-parameter pipeline input using format-aware pipeline variables', async () => {
    const env = createEnv();
    setPipelineContext(env, { format: 'json' });
    const execEnv = env.createChild();

    const result = await bindWithPreservation({
      env,
      execEnv,
      paramNames: ['input'],
      baseParamNames: ['input'],
      boundArgs: [],
      args: [],
      stdinInput: '{"count":3}',
      stageLanguage: 'js'
    });

    const inputVar = execEnv.getVariable('input') as any;

    expect(result.format).toBe('json');
    expect(inputVar).toBeTruthy();
    expect(inputVar.type).toBe('pipeline-input');
    expect(inputVar.format).toBe('json');
    expect(inputVar.rawText).toBe('{"count":3}');
    expect(inputVar.value.type).toBe('json');
    expect(inputVar.value.data).toEqual({ count: 3 });
  });
});
