import type { SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import type { CommandExecutionContext } from '@interpreter/env/ErrorUtils';
import type { OperationContext } from '@interpreter/env/ContextManager';
import { getOperationLabels, parseCommand } from '@core/policy/operation-labels';
import { collectInputDescriptor, descriptorToInputTaint, mergeInputDescriptors } from '@interpreter/policy/label-flow-utils';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import type { ExecutableOperationType } from '../normalize-executable';

export interface PolicyPreflightOptions {
  env: Environment;
  execEnv: Environment;
  execDef: any;
  commandVar: any;
  guardInputs: readonly unknown[];
  stdinInput?: string;
  operationContext?: OperationContext;
  executionContext?: CommandExecutionContext;
  opType: ExecutableOperationType;
}

export async function runPolicyPreflight(
  options: PolicyPreflightOptions
): Promise<SecurityDescriptor | undefined> {
  const {
    env,
    execEnv,
    execDef,
    commandVar,
    guardInputs,
    stdinInput,
    operationContext,
    executionContext,
    opType
  } = options;

  const policyEnforcer = new PolicyEnforcer(env.getPolicySummary());
  const execDescriptor = commandVar?.mx ? varMxToSecurityDescriptor(commandVar.mx) : undefined;
  const exeLabels = execDescriptor?.labels ? Array.from(execDescriptor.labels) : [];
  const guardDescriptor = collectInputDescriptor(guardInputs);
  const policyLocation = operationContext?.location ?? executionContext?.sourceLocation;
  let outputPolicyDescriptor: SecurityDescriptor | undefined;

  if (execDef.type === 'command' && execDef.commandTemplate) {
    const { interpolate } = await import('@interpreter/core/interpreter');
    const { InterpolationContext } = await import('@interpreter/core/interpolation-context');

    const commandDescriptors: SecurityDescriptor[] = [];
    const command = await interpolate(execDef.commandTemplate, execEnv, InterpolationContext.ShellCommand, {
      collectSecurityDescriptor: descriptor => {
        if (descriptor) {
          commandDescriptors.push(descriptor);
        }
      }
    });

    const parsedCommand = parseCommand(command);
    const opLabels = getOperationLabels({
      type: 'cmd',
      command: parsedCommand.command,
      subcommand: parsedCommand.subcommand
    });

    if (operationContext) {
      operationContext.command = command;
      operationContext.opLabels = opLabels;
      const metadata = { ...(operationContext.metadata ?? {}) } as Record<string, unknown>;
      metadata.commandPreview = command;
      operationContext.metadata = metadata;
    }
    env.updateOpContext({ command, opLabels });

    const commandDescriptor =
      commandDescriptors.length > 1
        ? env.mergeSecurityDescriptors(...commandDescriptors)
        : commandDescriptors[0];
    const inputDescriptor = mergeInputDescriptors(guardDescriptor, commandDescriptor);
    const inputTaint = descriptorToInputTaint(inputDescriptor);
    if (inputTaint.length > 0) {
      const flowChannel = execDef.withClause?.auth || execDef.withClause?.using
        ? 'using'
        : stdinInput !== undefined
          ? 'stdin'
          : 'arg';
      policyEnforcer.checkLabelFlow(
        {
          inputTaint,
          opLabels,
          exeLabels,
          flowChannel,
          command: parsedCommand.command
        },
        { env, sourceLocation: policyLocation }
      );
    }
    outputPolicyDescriptor = policyEnforcer.applyOutputPolicyLabels(undefined, { inputTaint, exeLabels });
  } else if (execDef.type === 'code' && execDef.codeTemplate) {
    const opLabels = opType ? getOperationLabels({ type: opType }) : [];
    const inputTaint = descriptorToInputTaint(guardDescriptor);
    if (opType && inputTaint.length > 0) {
      policyEnforcer.checkLabelFlow(
        {
          inputTaint,
          opLabels,
          exeLabels,
          flowChannel: 'arg'
        },
        { env, sourceLocation: policyLocation }
      );
    }
    outputPolicyDescriptor = policyEnforcer.applyOutputPolicyLabels(undefined, { inputTaint, exeLabels });
  } else if (execDef.type === 'nodeFunction') {
    const opLabels = getOperationLabels({ type: 'node' });
    const inputTaint = descriptorToInputTaint(guardDescriptor);
    if (inputTaint.length > 0) {
      policyEnforcer.checkLabelFlow(
        {
          inputTaint,
          opLabels,
          exeLabels,
          flowChannel: 'arg'
        },
        { env, sourceLocation: policyLocation }
      );
    }
    outputPolicyDescriptor = policyEnforcer.applyOutputPolicyLabels(undefined, { inputTaint, exeLabels });
  }

  return outputPolicyDescriptor;
}
