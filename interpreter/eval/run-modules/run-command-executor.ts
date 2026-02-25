import type { DirectiveNode, MlldNode, WithClause } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { evaluate, interpolate } from '@interpreter/core/interpreter';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import { AutoUnwrapManager } from '@interpreter/eval/auto-unwrap-manager';
import { extractSecurityDescriptor } from '@interpreter/utils/structured-value';
import { coerceValueForStdin } from '@interpreter/utils/shell-value';
import { resolveWorkingDirectory } from '@interpreter/utils/working-directory';
import type { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { mergeInputDescriptors } from '@interpreter/policy/label-flow-utils';
import { buildAuthDescriptor, resolveUsingEnvParts } from '@interpreter/utils/auth-injection';
import {
  applyEnvironmentDefaults,
  buildEnvironmentOutputDescriptor,
  executeProviderCommand,
  resolveEnvironmentAuthSecrets,
  resolveEnvironmentConfig
} from '@interpreter/env/environment-provider';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { deriveCommandTaint } from '@core/security/taint';
import { parseCommand } from '@core/policy/operation-labels';
import { MlldCommandExecutionError } from '@core/errors';
import type { CommandAnalyzer } from '@security/command/analyzer/CommandAnalyzer';
import type { SecurityManager } from '@security/SecurityManager';
import {
  applyRunOperationContext,
  buildRunCommandOperationUpdate,
  checkRunInputLabelFlow,
  enforceRunCommandPolicy
} from './run-policy-context';
import {
  getPreExtractedRunCommand,
  getPreExtractedRunDescriptor,
  getPreExtractedRunStdin
} from './run-pre-extracted-inputs';

type ResolvedStdinInput = {
  text: string;
  descriptor?: SecurityDescriptor;
};

export type RunCommandExecutionResult = {
  value: unknown;
  outputDescriptor?: SecurityDescriptor;
};

export type RunCommandExecutionParams = {
  directive: DirectiveNode;
  env: Environment;
  context?: EvaluationContext;
  withClause?: WithClause;
  executionContext: Record<string, unknown>;
  streamingEnabled: boolean;
  pipelineId: string;
  hasStreamFormat: boolean;
  suppressTerminal: boolean;
  policyEnforcer: PolicyEnforcer;
  policyChecksEnabled: boolean;
};

async function resolveStdinInput(
  stdinSource: unknown,
  env: Environment
): Promise<ResolvedStdinInput> {
  if (stdinSource === null || stdinSource === undefined) {
    return { text: '' };
  }

  const result = await evaluate(stdinSource as MlldNode | MlldNode[], env, { isExpression: true });
  let value = result.value;
  const descriptor = extractSecurityDescriptor(value, {
    recursive: true,
    mergeArrayElements: true
  });

  if (process.env.MLLD_DEBUG_STDIN === 'true') {
    try {
      console.error('[mlld] stdin evaluate result', JSON.stringify(value));
    } catch {
      console.error('[mlld] stdin evaluate result', value);
    }
  }

  const { isVariable, resolveValue, ResolutionContext } = await import('@interpreter/utils/variable-resolution');
  if (isVariable(value)) {
    value = await resolveValue(value, env, ResolutionContext.CommandExecution);
    if (process.env.MLLD_DEBUG_STDIN === 'true') {
      try {
        console.error('[mlld] stdin resolved variable', JSON.stringify(value));
      } catch {
        console.error('[mlld] stdin resolved variable', value);
      }
    }
  }

  return { text: coerceValueForStdin(value), descriptor };
}

async function extractRunCommandArgs(params: {
  args: any[];
  env: Environment;
}): Promise<{ argEnvVars: Record<string, string>; argDescriptors: SecurityDescriptor[] }> {
  const { args, env } = params;
  const argDescriptors: SecurityDescriptor[] = [];
  if (args.length === 0) {
    return { argEnvVars: {}, argDescriptors };
  }

  const argEnvVars = await AutoUnwrapManager.executeWithPreservation(async () => {
    const extracted: Record<string, string> = {};
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (!arg || typeof arg !== 'object' || arg.type !== 'VariableReference') {
        continue;
      }

      const varName = arg.identifier;
      const variable = env.getVariable(varName);
      if (!variable) {
        throw new Error(`Variable not found: ${varName}`);
      }

      if (variable.mx) {
        argDescriptors.push(varMxToSecurityDescriptor(variable.mx));
      }

      const value = await extractVariableValue(variable, env);
      const unwrappedValue = AutoUnwrapManager.unwrap(value);
      extracted[varName] = coerceValueForStdin(unwrappedValue);
    }

    return extracted;
  });

  return { argEnvVars, argDescriptors };
}

function enforceRunCommandSizeLimit(params: {
  command: string;
  directive: DirectiveNode;
  env: Environment;
  workingDirectory: string;
}): void {
  const { command, directive, env, workingDirectory } = params;

  try {
    const maxCommandBytes = (() => {
      const envValue = process.env.MLLD_MAX_SHELL_COMMAND_SIZE;
      if (!envValue) {
        return 128 * 1024;
      }
      const parsed = Number(envValue);
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 128 * 1024;
    })();

    const commandBytes = Buffer.byteLength(command || '', 'utf8');
    if (process.env.MLLD_DEBUG === 'true') {
      try {
        console.error(`[run.ts] /run command size: ${commandBytes} bytes (max ~${maxCommandBytes})`);
      } catch {
        // no-op
      }
    }

    if (commandBytes <= maxCommandBytes) {
      return;
    }

    const message = [
      'Command payload too large for /run execution (may exceed OS args+env limits).',
      `Command size: ${commandBytes} bytes (max ~${maxCommandBytes})`,
      'Suggestions:',
      '- Use `/run sh (@var) { echo "$var" | tool }` or `/exe ... = sh { ... }` to leverage heredocs',
      '- Pass file paths or stream via stdin (printf, here-strings)',
      '- Reduce or split the data',
      '',
      'Learn more: https://mlld.ai/docs/large-variables'
    ].join('\n');

    throw new MlldCommandExecutionError(
      message,
      directive.location,
      {
        command,
        exitCode: 1,
        duration: 0,
        stderr: message,
        workingDirectory,
        directiveType: 'run'
      },
      env
    );
  } catch (error) {
    if (error instanceof MlldCommandExecutionError) {
      throw error;
    }
  }
}

async function enforceRunCommandSecurity(params: {
  env: Environment;
  command: string;
  commandTaint: readonly string[];
  directive: DirectiveNode;
  workingDirectory: string;
}): Promise<void> {
  const { env, command, commandTaint, directive, workingDirectory } = params;
  const security = env.getSecurityManager();
  if (!security) {
    return;
  }

  const securityManager = security as SecurityManager & { commandAnalyzer?: CommandAnalyzer };
  const analyzer = securityManager.commandAnalyzer;
  if (!analyzer) {
    return;
  }

  const analysis = await analyzer.analyze(command, commandTaint);
  if (!analysis.blocked) {
    return;
  }

  const reason = analysis.risks[0]?.description || 'Security policy violation';
  throw new MlldCommandExecutionError(
    `Security: Command blocked - ${reason}`,
    directive.location,
    {
      command,
      exitCode: 1,
      duration: 0,
      stderr: `This command is blocked by security policy: ${reason}`,
      workingDirectory,
      directiveType: 'run'
    },
    env
  );
}

export async function executeRunCommand(
  params: RunCommandExecutionParams
): Promise<RunCommandExecutionResult> {
  const {
    directive,
    env,
    context,
    withClause,
    executionContext,
    streamingEnabled,
    pipelineId,
    hasStreamFormat,
    suppressTerminal,
    policyEnforcer,
    policyChecksEnabled
  } = params;

  const commandNodes = directive.values?.identifier || directive.values?.command;
  if (!commandNodes) {
    throw new Error('Run command directive missing command');
  }

  const preExtractedCommand = getPreExtractedRunCommand(context);
  const preExtractedDescriptor = getPreExtractedRunDescriptor(context);
  let commandDescriptor: SecurityDescriptor | undefined;
  let command: string;
  if (preExtractedCommand) {
    command = preExtractedCommand;
    commandDescriptor = preExtractedDescriptor;
  } else {
    const commandDescriptors: SecurityDescriptor[] = [];
    command = await interpolate(commandNodes, env, InterpolationContext.ShellCommand, {
      collectSecurityDescriptor: descriptor => {
        if (descriptor) {
          commandDescriptors.push(descriptor);
        }
      }
    });
    commandDescriptor =
      commandDescriptors.length > 0
        ? env.mergeSecurityDescriptors(...commandDescriptors)
        : undefined;
  }

  const runCommandArgs = ((directive.values as any)?.args || []) as any[];
  const { argEnvVars, argDescriptors } = await extractRunCommandArgs({
    args: runCommandArgs,
    env
  });

  const parsedCommand = parseCommand(command);
  const opUpdate = buildRunCommandOperationUpdate(
    command,
    (context?.operationContext?.metadata ?? {}) as Record<string, unknown>
  );
  applyRunOperationContext(env, context, opUpdate);
  const opLabels = (opUpdate.opLabels ?? []) as string[];
  const exeLabels = Array.from(env.getEnclosingExeLabels());

  enforceRunCommandPolicy(
    env.getPolicySummary(),
    command,
    env,
    directive.location ?? undefined
  );

  const runArgDescriptor =
    argDescriptors.length > 0 ? env.mergeSecurityDescriptors(...argDescriptors) : undefined;
  const commandInputDescriptor =
    commandDescriptor && runArgDescriptor
      ? env.mergeSecurityDescriptors(commandDescriptor, runArgDescriptor)
      : commandDescriptor || runArgDescriptor;

  checkRunInputLabelFlow({
    descriptor: commandInputDescriptor,
    policyEnforcer,
    policyChecksEnabled,
    opLabels,
    exeLabels,
    flowChannel: 'arg',
    command: parsedCommand.command,
    env,
    sourceLocation: directive.location ?? undefined
  });

  const workingDirectory = await resolveWorkingDirectory(
    (directive.values as any)?.workingDir,
    env,
    { sourceLocation: directive.location, directiveType: 'run' }
  );
  const effectiveWorkingDirectory = workingDirectory || env.getExecutionDirectory();
  const commandTaint = deriveCommandTaint({ command });
  const scopedEnvConfig = resolveEnvironmentConfig(env, context?.guardMetadata);
  const resolvedEnvConfig = applyEnvironmentDefaults(scopedEnvConfig, env.getPolicySummary());
  const baseOutputDescriptor = buildEnvironmentOutputDescriptor(command, resolvedEnvConfig);
  let outputDescriptor =
    mergeInputDescriptors(baseOutputDescriptor, commandInputDescriptor) ?? baseOutputDescriptor;
  if (resolvedEnvConfig?.provider) {
    env.enforceToolAllowed('bash', {
      sourceLocation: directive.location ?? undefined,
      reason: "Command execution requires 'Bash' in env.tools"
    });
  }

  enforceRunCommandSizeLimit({
    command,
    directive,
    env,
    workingDirectory: effectiveWorkingDirectory
  });

  await enforceRunCommandSecurity({
    env,
    command,
    commandTaint: commandTaint.taint,
    directive,
    workingDirectory: effectiveWorkingDirectory
  });

  let stdinInput: string | undefined;
  let stdinDescriptor: SecurityDescriptor | undefined;
  if (withClause && 'stdin' in withClause) {
    const preExtractedStdin = getPreExtractedRunStdin(context);
    if (preExtractedStdin) {
      stdinInput = preExtractedStdin.text;
      stdinDescriptor = preExtractedStdin.descriptor;
    } else {
      const resolvedStdin = await resolveStdinInput(withClause.stdin, env);
      stdinInput = resolvedStdin.text;
      stdinDescriptor = resolvedStdin.descriptor;
    }
  }

  checkRunInputLabelFlow({
    descriptor: stdinDescriptor,
    policyEnforcer,
    policyChecksEnabled,
    opLabels,
    exeLabels,
    flowChannel: 'stdin',
    command: parsedCommand.command,
    env,
    sourceLocation: directive.location ?? undefined
  });

  const usingParts = await resolveUsingEnvParts(env, withClause);
  const envAuthSecrets = await resolveEnvironmentAuthSecrets(env, resolvedEnvConfig);
  const envAuthDescriptor = buildAuthDescriptor(resolvedEnvConfig?.auth);
  const envInputDescriptor = mergeInputDescriptors(usingParts.descriptor, envAuthDescriptor);

  outputDescriptor =
    mergeInputDescriptors(outputDescriptor, stdinDescriptor, envInputDescriptor) ?? outputDescriptor;

  checkRunInputLabelFlow({
    descriptor: envInputDescriptor,
    policyEnforcer,
    policyChecksEnabled,
    opLabels,
    exeLabels,
    flowChannel: 'using',
    command: parsedCommand.command,
    env,
    sourceLocation: directive.location ?? undefined
  });

  if (resolvedEnvConfig?.provider) {
    const providerResult = await executeProviderCommand({
      env,
      providerRef: resolvedEnvConfig.provider,
      config: resolvedEnvConfig,
      command,
      workingDirectory,
      stdin: stdinInput,
      vars: {
        ...argEnvVars,
        ...usingParts.vars
      },
      secrets: {
        ...envAuthSecrets,
        ...usingParts.secrets
      },
      executionContext: {
        ...executionContext,
        streamingEnabled,
        pipelineId,
        suppressTerminal,
        workingDirectory
      },
      sourceLocation: directive.location ?? null,
      directiveType: 'run'
    });

    return {
      value: providerResult.stdout ?? '',
      outputDescriptor
    };
  }

  const injectedEnv = {
    ...argEnvVars,
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

  return {
    value: await env.executeCommand(command, commandOptions, {
      ...executionContext,
      streamingEnabled,
      pipelineId,
      suppressTerminal: hasStreamFormat || suppressTerminal,
      workingDirectory
    }),
    outputDescriptor
  };
}
