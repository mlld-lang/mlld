import { describe, it, expect } from 'vitest';
import { Environment } from '@interpreter/env/Environment';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';
import { PipelineExecutor } from '@interpreter/eval/pipeline/executor';
import type { PipelineStage, PipelineCommand } from '@core/types';
import type { StageContext } from '@interpreter/eval/pipeline/state-machine';

describe('pipeline stage context', () => {
  it('pushes operation metadata for each stage', async () => {
    const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
    const command: PipelineCommand = {
      rawIdentifier: '__identity__',
      identifier: [],
      args: [],
      fields: [],
      rawArgs: []
    };
    const pipeline: PipelineStage[] = [command];
    const executor = new PipelineExecutor(pipeline, env);

    const observedTypes: string[] = [];
    const originalExecuteCommand = (executor as any).executeCommand.bind(executor);
    (executor as any).executeCommand = async (
      cmd: PipelineCommand,
      input: string,
      structuredInput: ReturnType<typeof wrapStructured>,
      stageEnv: Environment
    ) => {
      const ctxValue = stageEnv.getVariable('ctx')?.value as any;
      observedTypes.push(ctxValue?.op?.type);
      return await originalExecuteCommand(cmd, input, structuredInput, stageEnv);
    };

    const stageContext: StageContext = {
      stage: 1,
      attempt: 1,
      contextAttempt: 1,
      history: [],
      previousOutputs: [],
      globalAttempt: 1,
      totalStages: 1,
      outputs: {},
      currentHint: null,
      hintHistory: []
    };

    await (executor as any).executeSingleStage(
      0,
      command,
      'seed',
      stageContext
    );

    expect(observedTypes).toEqual(['pipeline-stage']);
  });
});
