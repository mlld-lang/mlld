import type { SourceLocation } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import type { CommandExecutionContext } from '@interpreter/env/ErrorUtils';
import type { HookDecision } from '@interpreter/hooks/HookManager';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { getOperationLabels, parseCommand } from '@core/policy/operation-labels';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { descriptorToInputTaint, mergeInputDescriptors } from '@interpreter/policy/label-flow-utils';
import { buildAuthDescriptor, resolveUsingEnvParts } from '@interpreter/utils/auth-injection';
import {
  applyEnvironmentDefaults,
  buildEnvironmentOutputDescriptor,
  executeProviderCommand,
  resolveEnvironmentAuthSecrets,
  resolveEnvironmentConfig
} from '@interpreter/env/environment-provider';
import { wrapExecResult } from '@interpreter/utils/structured-exec';
import {
  applySecurityDescriptorToStructuredValue,
  extractSecurityDescriptor,
  isStructuredValue
} from '@interpreter/utils/structured-value';

export type RetrySignalLike = { value: 'retry'; hint?: any; from?: number };

export type FinalizeResult = (
  value: unknown,
  options?: { type?: string; text?: string }
) => unknown;

export interface ExecuteCommandHandlerOptions {
  env: Environment;
  execEnv: Environment;
  execDef: any;
  commandVar: any;
  stdinInput?: string;
  workingDirectory?: string;
  executionContext?: CommandExecutionContext;
  preDecision?: HookDecision;
  outputPolicyDescriptor?: SecurityDescriptor;
  policyLocation?: SourceLocation;
  finalizeResult: FinalizeResult;
}

export interface ExecuteCommandHandlerResult {
  value: unknown;
  mergedOutputDescriptor?: SecurityDescriptor;
  retrySignal?: 'retry' | RetrySignalLike;
}

export async function executeCommandHandler(
  options: ExecuteCommandHandlerOptions
): Promise<ExecuteCommandHandlerResult> {
  const {
    env,
    execEnv,
    execDef,
    commandVar,
    stdinInput,
    workingDirectory,
    executionContext,
    preDecision,
    outputPolicyDescriptor,
    policyLocation,
    finalizeResult
  } = options;

  const { interpolate } = await import('@interpreter/core/interpreter');
  const { InterpolationContext } = await import('@interpreter/core/interpolation-context');
  const command = await interpolate(execDef.commandTemplate, execEnv, InterpolationContext.ShellCommand);
  const scopedEnvConfig = resolveEnvironmentConfig(execEnv, preDecision?.metadata);
  const resolvedEnvConfig = applyEnvironmentDefaults(scopedEnvConfig, execEnv.getPolicySummary());
  const outputDescriptor = buildEnvironmentOutputDescriptor(command, resolvedEnvConfig);
  const mergedOutputDescriptor = outputPolicyDescriptor
    ? outputDescriptor
      ? env.mergeSecurityDescriptors(outputDescriptor, outputPolicyDescriptor)
      : outputPolicyDescriptor
    : outputDescriptor;

  const applyOutputDescriptor = (value: unknown): unknown => {
    if (!mergedOutputDescriptor) {
      return value;
    }
    if (value && typeof value === 'object' && isStructuredValue(value)) {
      const existing = extractSecurityDescriptor(value, { recursive: true, mergeArrayElements: true });
      const merged = existing ? env.mergeSecurityDescriptors(existing, mergedOutputDescriptor) : mergedOutputDescriptor;
      applySecurityDescriptorToStructuredValue(value, merged);
      return value;
    }
    const wrapped = wrapExecResult(value);
    applySecurityDescriptorToStructuredValue(wrapped, mergedOutputDescriptor);
    return wrapped;
  };

  const usingParts = await resolveUsingEnvParts(execEnv, execDef.withClause);
  const envAuthSecrets = await resolveEnvironmentAuthSecrets(execEnv, resolvedEnvConfig);
  const envAuthDescriptor = buildAuthDescriptor(resolvedEnvConfig?.auth);
  const envInputDescriptor = mergeInputDescriptors(usingParts.descriptor, envAuthDescriptor);
  const envInputTaint = descriptorToInputTaint(envInputDescriptor);
  if (envInputTaint.length > 0) {
    const parsedCommand = parseCommand(command);
    const opLabels = getOperationLabels({
      type: 'cmd',
      command: parsedCommand.command,
      subcommand: parsedCommand.subcommand
    });
    const execDescriptor = commandVar?.mx ? varMxToSecurityDescriptor(commandVar.mx) : undefined;
    const exeLabels = execDescriptor?.labels ? Array.from(execDescriptor.labels) : [];
    const policyEnforcer = new PolicyEnforcer(env.getPolicySummary());
    policyEnforcer.checkLabelFlow(
      {
        inputTaint: envInputTaint,
        opLabels,
        exeLabels,
        flowChannel: 'using',
        command: parsedCommand.command
      },
      { env, sourceLocation: policyLocation }
    );
  }

  let commandOutput: unknown;
  if (resolvedEnvConfig?.provider) {
    const providerResult = await executeProviderCommand({
      env: execEnv,
      providerRef: resolvedEnvConfig.provider,
      config: resolvedEnvConfig,
      command,
      workingDirectory,
      stdin: stdinInput,
      vars: usingParts.vars,
      secrets: {
        ...envAuthSecrets,
        ...usingParts.secrets
      },
      executionContext,
      sourceLocation: commandVar?.mx?.definedAt ?? null,
      directiveType: executionContext?.directiveType ?? 'exec'
    });
    commandOutput = providerResult.stdout ?? '';
  } else {
    const injectedEnv = {
      ...envAuthSecrets,
      ...usingParts.merged
    };
    const commandOptions =
      stdinInput !== undefined || workingDirectory || Object.keys(injectedEnv).length > 0
        ? {
            ...(stdinInput !== undefined ? { input: stdinInput } : {}),
            ...(workingDirectory ? { workingDirectory } : {}),
            ...(Object.keys(injectedEnv).length > 0 ? { env: injectedEnv } : {})
          }
        : undefined;
    commandOutput = await env.executeCommand(
      command,
      commandOptions as any,
      executionContext
    );
  }

  const withClause = execDef.withClause;
  if (withClause && withClause.pipeline && withClause.pipeline.length > 0) {
    const { processPipeline } = await import('@interpreter/eval/pipeline/unified-processor');
    const processed = await processPipeline({
      value: commandOutput,
      env,
      pipeline: withClause.pipeline,
      format: withClause.format as string | undefined,
      isRetryable: false,
      identifier: commandVar?.name,
      location: commandVar.mx?.definedAt,
      descriptorHint: mergedOutputDescriptor
    });
    if (processed === 'retry') {
      return {
        value: 'retry',
        retrySignal: 'retry',
        mergedOutputDescriptor
      };
    }
    if (processed && typeof processed === 'object' && (processed as any).value === 'retry') {
      return {
        value: processed,
        retrySignal: processed as RetrySignalLike,
        mergedOutputDescriptor
      };
    }
    commandOutput = processed;
  }

  return {
    value: applyOutputDescriptor(finalizeResult(commandOutput)),
    mergedOutputDescriptor
  };
}
