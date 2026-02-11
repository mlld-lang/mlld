import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PipelineCommand } from '@core/types';
import { Environment } from '@interpreter/env/Environment';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { wrapStructured } from '@interpreter/utils/structured-value';
import * as commandExecution from '@interpreter/eval/pipeline/command-execution';
import { PipelineCommandArgumentBinder } from './command-argument-binder';
import { PipelineCommandInvoker } from './command-invoker';

function createEnv(): Environment {
  return new Environment(new MemoryFileSystem(), new PathService(), '/');
}

function createCommand(overrides: Partial<PipelineCommand> = {}): PipelineCommand {
  return {
    identifier: [
      {
        type: 'VariableReference',
        identifier: 'stage',
        fields: []
      } as any
    ],
    args: [],
    fields: [],
    rawIdentifier: 'stage',
    rawArgs: [],
    ...overrides
  };
}

describe('pipeline command invoker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes resolved command references with explicit argument evaluation', async () => {
    const env = createEnv();
    const binder = new PipelineCommandArgumentBinder();
    const invoker = new PipelineCommandInvoker(env, binder);
    const command = createCommand({
      args: [{ type: 'Text', content: 'value' } as any]
    });
    const structuredInput = wrapStructured('seed', 'text', 'seed');

    const resolveSpy = vi.spyOn(commandExecution, 'resolveCommandReference').mockResolvedValue({ name: 'stage' } as any);
    const executeSpy = vi.spyOn(commandExecution, 'executeCommandVariable').mockResolvedValue('ok' as any);
    vi.spyOn(binder, 'processArguments').mockResolvedValue(['explicit-arg']);
    const autoBindSpy = vi.spyOn(binder, 'bindParametersAutomatically').mockResolvedValue(['auto-arg']);

    const result = await invoker.invokeCommand({
      command,
      stageEnv: env,
      input: 'seed',
      structuredInput
    });

    expect(resolveSpy).toHaveBeenCalledWith(command, env);
    expect(autoBindSpy).not.toHaveBeenCalled();
    expect(executeSpy).toHaveBeenCalledWith(
      expect.any(Object),
      ['explicit-arg'],
      env,
      'seed',
      structuredInput,
      undefined
    );
    expect(result).toMatchObject({ result: 'ok' });
  });

  it('falls back to automatic binding when explicit args are absent', async () => {
    const env = createEnv();
    const binder = new PipelineCommandArgumentBinder();
    const invoker = new PipelineCommandInvoker(env, binder);
    const command = createCommand();
    const structuredInput = wrapStructured('seed', 'text', 'seed');
    const resolved = { name: 'stage' };

    vi.spyOn(commandExecution, 'resolveCommandReference').mockResolvedValue(resolved as any);
    const executeSpy = vi.spyOn(commandExecution, 'executeCommandVariable').mockResolvedValue('ok' as any);
    vi.spyOn(binder, 'processArguments').mockResolvedValue([]);
    const autoBindSpy = vi.spyOn(binder, 'bindParametersAutomatically').mockResolvedValue(['auto-arg']);

    await invoker.invokeCommand({
      command,
      stageEnv: env,
      input: 'seed',
      structuredInput
    });

    expect(autoBindSpy).toHaveBeenCalledWith(resolved, 'seed', structuredInput);
    expect(executeSpy).toHaveBeenCalledWith(
      resolved,
      ['auto-arg'],
      env,
      'seed',
      structuredInput,
      undefined
    );
  });

  it('composes command labels from inline stage labels and executable labels', () => {
    const env = createEnv();
    const binder = new PipelineCommandArgumentBinder();
    const invoker = new PipelineCommandInvoker(env, binder);

    const descriptor = invoker.buildCommandLabelDescriptor(
      {
        ...createCommand(),
        securityLabels: ['inline-secret']
      } as any,
      {
        mx: {
          labels: ['exec-trusted']
        }
      }
    );

    expect(descriptor?.labels ?? []).toEqual(expect.arrayContaining(['inline-secret', 'exec-trusted']));
  });
});
