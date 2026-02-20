import type { SourceLocation } from '@core/types';
import { MlldSecurityError } from '@core/errors';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';
import { evaluateCapabilityAccess, evaluateCommandAccess } from '@core/policy/guards';
import { getOperationLabels, getOperationSources, parseCommand } from '@core/policy/operation-labels';
import type { OperationContext } from '@interpreter/env/ContextManager';
import type { Environment } from '@interpreter/env/Environment';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import type { PolicyConfig } from '@core/policy/union';
import type { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';

export type RunLabelFlowChannel = 'arg' | 'stdin' | 'using';

export function applyRunOperationContext(
  env: Environment,
  context: EvaluationContext | undefined,
  update: Partial<OperationContext>
): void {
  if (context?.operationContext) {
    Object.assign(context.operationContext, update);
  }
  env.updateOpContext(update);
}

export function buildRunCommandOperationUpdate(
  command: string,
  existingMetadata?: Record<string, unknown>
): Partial<OperationContext> {
  const parsedCommand = parseCommand(command);
  const opLabels = getOperationLabels({
    type: 'cmd',
    command: parsedCommand.command,
    subcommand: parsedCommand.subcommand
  });
  if (!opLabels.includes('op:run')) {
    opLabels.push('op:run');
  }
  const opSources = getOperationSources({
    type: 'cmd',
    command: parsedCommand.command,
    subcommand: parsedCommand.subcommand
  });
  const metadata = { ...(existingMetadata ?? {}) };
  metadata.commandPreview = command;

  const update: Partial<OperationContext> = {
    opLabels,
    command,
    metadata
  };
  if (opSources.length > 0) {
    update.sources = opSources;
  }
  return update;
}

export function buildRunCapabilityOperationUpdate(
  capability: string,
  options?: { includeSubtype?: boolean; includeSources?: boolean }
): Partial<OperationContext> {
  const opLabels = getOperationLabels({ type: capability });
  const update: Partial<OperationContext> = { opLabels };
  if (options?.includeSubtype) {
    update.subtype = capability;
  }
  if (options?.includeSources) {
    const opSources = getOperationSources({ type: capability });
    if (opSources.length > 0) {
      update.sources = opSources;
    }
  }
  return update;
}

export function enforceRunCommandPolicy(
  policySummary: PolicyConfig | undefined,
  command: string,
  env: Environment,
  sourceLocation?: SourceLocation
): void {
  if (!policySummary) {
    return;
  }

  const decision = evaluateCommandAccess(policySummary, command);
  if (decision.allowed) {
    return;
  }

  throw new MlldSecurityError(
    decision.reason ?? `Command '${decision.commandName}' denied by policy`,
    {
      code: 'POLICY_CAPABILITY_DENIED',
      sourceLocation,
      env
    }
  );
}

export function enforceRunCapabilityPolicy(
  policySummary: PolicyConfig | undefined,
  capability: string,
  env: Environment,
  sourceLocation?: SourceLocation
): void {
  if (!policySummary) {
    return;
  }

  const decision = evaluateCapabilityAccess(policySummary, capability);
  if (decision.allowed) {
    return;
  }

  throw new MlldSecurityError(
    decision.reason ?? `Capability '${capability}' denied by policy`,
    {
      code: 'POLICY_CAPABILITY_DENIED',
      sourceLocation,
      env
    }
  );
}

export function checkRunInputLabelFlow(params: {
  descriptor?: SecurityDescriptor;
  policyEnforcer: PolicyEnforcer;
  policyChecksEnabled: boolean;
  opLabels: readonly string[];
  exeLabels: readonly string[];
  flowChannel: RunLabelFlowChannel;
  env: Environment;
  sourceLocation?: SourceLocation;
  command?: string;
}): readonly DataLabel[] {
  const inputTaint = descriptorToInputTaint(params.descriptor);
  if (!params.policyChecksEnabled || inputTaint.length === 0) {
    return inputTaint;
  }

  params.policyEnforcer.checkLabelFlow(
    {
      inputTaint,
      opLabels: params.opLabels,
      exeLabels: params.exeLabels,
      flowChannel: params.flowChannel,
      ...(params.command ? { command: params.command } : {})
    },
    {
      env: params.env,
      sourceLocation: params.sourceLocation
    }
  );
  return inputTaint;
}

export function deriveRunOutputPolicyDescriptor(params: {
  policyEnforcer: PolicyEnforcer;
  inputTaint: readonly DataLabel[];
  exeLabels: readonly DataLabel[];
}): SecurityDescriptor | undefined {
  return params.policyEnforcer.applyOutputPolicyLabels(undefined, {
    inputTaint: params.inputTaint,
    exeLabels: params.exeLabels
  });
}
