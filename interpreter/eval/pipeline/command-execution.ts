import type { Environment } from '../../env/Environment';
import type { CommandExecutionContext } from '../../env/ErrorUtils';
import type { PipelineCommand } from '@core/types';
import { MlldCommandExecutionError } from '@core/errors';
import type { SecurityDescriptor } from '@core/types/security';
import {
  asText,
  isStructuredValue,
  looksLikeJsonString,
  applySecurityDescriptorToStructuredValue,
  extractSecurityDescriptor,
  type StructuredValue
} from '../../utils/structured-value';
import { wrapExecResult } from '../../utils/structured-exec';
import { normalizeTransformerResult } from '../../utils/transformer-result';
import type { HookableNode } from '@core/types/hooks';
import type { HookDecision } from '../../hooks/HookManager';
import type { OperationContext } from '../../env/ContextManager';
import { resolveWorkingDirectory } from '../../utils/working-directory';
import { bindPipelineParameters } from './command-execution/bind-pipeline-params';
import { resolvePipelineCommandReference } from './command-execution/resolve-command-reference';
import { normalizeExecutableDescriptor } from './command-execution/normalize-executable';
import {
  buildGuardPreflightContext,
  executeGuardPreflight
} from './command-execution/preflight/guard-preflight';
import { runPolicyPreflight } from './command-execution/preflight/policy-preflight';
import { executeCommandHandler } from './command-execution/handlers/execute-command';
import { executeCodeHandler } from './command-execution/handlers/execute-code';
import { executeNodeHandler } from './command-execution/handlers/execute-node';
import { executeTemplateHandler } from './command-execution/handlers/execute-template';
import { executeCommandRefHandler } from './command-execution/handlers/execute-command-ref';

export type RetrySignal = { value: 'retry'; hint?: any; from?: number };
type CommandExecutionPrimitive = string | number | boolean | null | undefined;
export type CommandExecutionResult =
  | CommandExecutionPrimitive
  | StructuredValue
  | Record<string, unknown>
  | unknown[]
  | RetrySignal;

export interface CommandExecutionHookOptions {
  operationContext?: OperationContext;
  hookNode?: HookableNode;
  stageInputs?: readonly unknown[];
  executionContext?: CommandExecutionContext;
}

/**
 * Resolve a command reference to an executable variable
 */
/**
 * Resolve a pipeline command reference to an executable or value.
 * WHY: Commands may be object methods, executables, or values with field access.
 * CONTEXT: Used by pipeline execution to resolve identifiers from the stage env.
 */
export async function resolveCommandReference(
  command: PipelineCommand,
  env: Environment
): Promise<any> {
  return resolvePipelineCommandReference(command, env);
}

/**
 * Execute a command variable with arguments
 */
/**
 * Execute a resolved command variable with arguments in a stage environment.
 * WHY: Handle built-in transformers, code/command/template execs, and when-expressions.
 * CONTEXT: First parameter in pipeline gets @input (format-aware), other params bind explicitly.
 */
export async function executeCommandVariable(
  commandVar: any,
  args: any[],
  env: Environment,
  stdinInput?: string,
  structuredInput?: StructuredValue,
  hookOptions?: CommandExecutionHookOptions
): Promise<CommandExecutionResult> {
  let outputPolicyDescriptor: SecurityDescriptor | undefined;
  const finalizeResult = (
    value: unknown,
    options?: { type?: string; text?: string }
  ): CommandExecutionResult => {
    let wrapped: CommandExecutionResult;
    if (
      typeof value === 'string' &&
      (!options || !options.type || options.type === 'text') &&
      looksLikeJsonString(value)
    ) {
      try {
        const parsed = JSON.parse(value.trim());
        const typeHint = Array.isArray(parsed) ? 'array' : 'object';
        wrapped = wrapExecResult(parsed, { type: typeHint, text: options?.text ?? value });
      } catch {
        // Fall through to default wrapping when JSON.parse fails
      }
    }
    if (!wrapped) {
      wrapped = wrapExecResult(value, options);
    }
    if (outputPolicyDescriptor && isStructuredValue(wrapped)) {
      const existing = extractSecurityDescriptor(wrapped, { recursive: true, mergeArrayElements: true });
      const merged = existing
        ? env.mergeSecurityDescriptors(existing, outputPolicyDescriptor)
        : outputPolicyDescriptor;
      applySecurityDescriptorToStructuredValue(wrapped, merged);
    }
    return wrapped;
  };

  // Built-in transformer handling
  if (commandVar && commandVar.internal?.isBuiltinTransformer && commandVar.internal?.transformerImplementation) {
    try {
      const result = await commandVar.internal.transformerImplementation(stdinInput || '');
      const normalized = normalizeTransformerResult(commandVar?.name, result);
      return finalizeResult(normalized.value, normalized.options);
    } catch (error) {
      throw new MlldCommandExecutionError(
        `Transformer ${commandVar.name} failed: ${error.message}`,
        undefined,
        {
          command: commandVar.name,
          exitCode: 1,
          duration: 0,
          workingDirectory: env.getExecutionDirectory()
        }
      );
    }
  }
  
  const {
    execDef,
    boundArgs,
    baseParamNames,
    paramNames,
    whenExprNode,
    stageLanguage,
    opType
  } = normalizeExecutableDescriptor(commandVar);

  const execEnv = env.createChild();
  const { pipelineCtx, format } = await bindPipelineParameters({
    env,
    execEnv,
    paramNames,
    baseParamNames,
    boundArgs,
    args,
    stdinInput,
    structuredInput,
    stageLanguage
  });

  const hookNode = hookOptions?.hookNode;
  const operationContext = hookOptions?.operationContext;
  let preDecision: HookDecision | undefined;
  const stageInputs = hookOptions?.stageInputs ?? [];
  const { guardInputs } = buildGuardPreflightContext({
    env,
    execEnv,
    stageInputs,
    baseParamNames
  });

  outputPolicyDescriptor = await runPolicyPreflight({
    env,
    execEnv,
    execDef,
    commandVar,
    guardInputs,
    stdinInput,
    operationContext,
    executionContext: hookOptions?.executionContext,
    opType
  });

  const guardPreflightResult = await executeGuardPreflight({
    env,
    execEnv,
    guardInputs,
    hookNode,
    operationContext,
    whenExprNode
  });
  preDecision = guardPreflightResult.preDecision;
  if (guardPreflightResult.hasFallbackResult) {
    return finalizeResult(guardPreflightResult.fallbackValue ?? '');
  }
  // Execute based on type
  let workingDirectory: string | undefined;
  if (execDef?.workingDir) {
    workingDirectory = await resolveWorkingDirectory(execDef.workingDir as any, execEnv, {
      sourceLocation: commandVar?.mx?.definedAt,
      directiveType: hookOptions?.executionContext?.directiveType || 'exec'
    });
  }
  const executionContext = hookOptions?.executionContext
    ? { ...hookOptions?.executionContext, workingDirectory: workingDirectory ?? hookOptions.executionContext?.workingDirectory }
    : (workingDirectory ? { workingDirectory } : hookOptions?.executionContext);

  if (execDef.type === 'command' && execDef.commandTemplate) {
    const commandBranchResult = await executeCommandHandler({
      env,
      execEnv,
      execDef,
      commandVar,
      stdinInput,
      workingDirectory,
      executionContext,
      preDecision,
      outputPolicyDescriptor,
      policyLocation: operationContext?.location ?? hookOptions?.executionContext?.sourceLocation,
      finalizeResult
    });
    return commandBranchResult.value as CommandExecutionResult;
  } else if (execDef.type === 'code' && execDef.codeTemplate) {
    const codeResult = await executeCodeHandler({
      env,
      execEnv,
      execDef,
      stdinInput,
      workingDirectory,
      executionContext,
      pipelineCtx,
      format,
      stageLanguage,
      finalizeResult
    });
    return codeResult as CommandExecutionResult;
  } else if (execDef.type === 'nodeFunction' || execDef.type === 'nodeClass') {
    const nodeResult = await executeNodeHandler({
      execDef,
      execEnv,
      commandVar,
      args,
      boundArgs,
      baseParamNames,
      pipelineCtx,
      stdinInput,
      structuredInput,
      errorLocation: hookOptions?.executionContext?.sourceLocation ?? commandVar?.mx?.definedAt,
      finalizeResult
    });
    return nodeResult as CommandExecutionResult;
  } else if (execDef.type === 'template' && execDef.template) {
    const templateResult = await executeTemplateHandler({
      execEnv,
      execDef
    });
    return templateResult as CommandExecutionResult;
  } else if (execDef.type === 'commandRef') {
    const commandRefResult = await executeCommandRefHandler({
      env,
      execEnv,
      execDef,
      stdinInput,
      structuredInput,
      hookOptions,
      finalizeResult,
      executeCommandVariable: (
        nextCommandVar,
        nextArgs,
        nextEnv,
        nextStdinInput,
        nextStructuredInput,
        nextHookOptions
      ) =>
        executeCommandVariable(
          nextCommandVar,
          nextArgs,
          nextEnv,
          nextStdinInput,
          nextStructuredInput,
          nextHookOptions as CommandExecutionHookOptions | undefined
        )
    });
    return commandRefResult as CommandExecutionResult;
  }
  
  throw new Error(`Unsupported executable type in pipeline: ${execDef.type}`);
}
