import type { PipelineCommand } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import type { StructuredValue } from '@interpreter/utils/structured-value';
import type { SecurityDescriptor, DataLabel } from '@core/types/security';
import { makeSecurityDescriptor } from '@core/types/security';
import type { CommandExecutionHookOptions } from '@interpreter/eval/pipeline/command-execution';
import type { StageExecutionResult } from './types';
import { PipelineCommandArgumentBinder } from './command-argument-binder';

interface InvocationRequest {
  command: PipelineCommand;
  stageEnv: Environment;
  input: string;
  structuredInput: StructuredValue;
  hookOptions?: CommandExecutionHookOptions;
}

export class PipelineCommandInvoker {
  constructor(
    private readonly env: Environment,
    private readonly argumentBinder: PipelineCommandArgumentBinder
  ) {}

  async invokeCommand(request: InvocationRequest): Promise<StageExecutionResult> {
    const { command, stageEnv, input, structuredInput, hookOptions } = request;
    const commandVar = await this.resolveCommandReference(command, stageEnv);
    if (!commandVar) {
      throw new Error(`Pipeline command ${command.rawIdentifier} not found`);
    }

    const { AutoUnwrapManager } = await import('@interpreter/eval/auto-unwrap-manager');
    let args = await this.argumentBinder.processArguments(command.args || [], stageEnv);
    if (args.length === 0) {
      args = await AutoUnwrapManager.executeWithPreservation(async () => {
        return await this.argumentBinder.bindParametersAutomatically(commandVar, input, structuredInput);
      });
    }

    const result = await AutoUnwrapManager.executeWithPreservation(async () => {
      const { executeCommandVariable } = await import('@interpreter/eval/pipeline/command-execution');
      return await executeCommandVariable(commandVar, args, stageEnv, input, structuredInput, hookOptions);
    });

    return {
      result: result as any,
      labelDescriptor: this.buildCommandLabelDescriptor(command, commandVar)
    };
  }

  async resolveCommandReference(command: PipelineCommand, env: Environment): Promise<any> {
    const { resolveCommandReference } = await import('@interpreter/eval/pipeline/command-execution');
    return await resolveCommandReference(command, env);
  }

  buildCommandLabelDescriptor(
    command: PipelineCommand,
    commandVar: any
  ): SecurityDescriptor | undefined {
    const descriptors: SecurityDescriptor[] = [];
    const inlineLabels = (command as any)?.securityLabels as DataLabel[] | undefined;
    if (inlineLabels && inlineLabels.length > 0) {
      descriptors.push(makeSecurityDescriptor({ labels: inlineLabels }));
    }
    const variableLabels = Array.isArray(commandVar?.mx?.labels) ? (commandVar.mx.labels as DataLabel[]) : undefined;
    if (variableLabels && variableLabels.length > 0) {
      descriptors.push(makeSecurityDescriptor({ labels: variableLabels }));
    }
    if (descriptors.length === 0) {
      return undefined;
    }
    if (descriptors.length === 1) {
      return descriptors[0];
    }
    return this.env.mergeSecurityDescriptors(...descriptors);
  }
}
