import type { Environment } from '../../env/Environment';
import type { CommandExecutionContext } from '../../env/ErrorUtils';
import type { PipelineCommand } from '@core/types';
import { MlldCommandExecutionError, MlldInterpreterError } from '@core/errors';
import type { SecurityDescriptor } from '@core/types/security';
import {
  asText,
  isStructuredValue,
  looksLikeJsonString,
  normalizeWhenShowEffect,
  applySecurityDescriptorToStructuredValue,
  extractSecurityDescriptor,
  type StructuredValue,
  type StructuredValueType
} from '../../utils/structured-value';
import { wrapExecResult } from '../../utils/structured-exec';
import { normalizeTransformerResult } from '../../utils/transformer-result';
import type { Variable } from '@core/types/variable/VariableTypes';
import { getOperationLabels, parseCommand } from '@core/policy/operation-labels';
import { isEventEmitter, isLegacyStream, toJsValue, wrapNodeValue } from '../../utils/node-interop';
import type { HookableNode } from '@core/types/hooks';
import type { HookDecision } from '../../hooks/HookManager';
import type { OperationContext } from '../../env/ContextManager';
import { materializeGuardInputs } from '../../utils/guard-inputs';
import { handleGuardDecision } from '../../hooks/hook-decision-handler';
import { handleExecGuardDenial } from '../guard-denial-handler';
import { resolveWorkingDirectory } from '../../utils/working-directory';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { collectInputDescriptor, descriptorToInputTaint, mergeInputDescriptors } from '@interpreter/policy/label-flow-utils';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { buildAuthDescriptor, resolveUsingEnvParts } from '@interpreter/utils/auth-injection';
import {
  applyEnvironmentDefaults,
  buildEnvironmentOutputDescriptor,
  executeProviderCommand,
  resolveEnvironmentConfig,
  resolveEnvironmentAuthSecrets
} from '@interpreter/env/environment-provider';
import {
  shouldAutoParsePipelineInput,
  wrapJsonLikeString
} from './command-execution/structured-input';
import {
  bindPipelineParameters,
  normalizePipelineParameterValue
} from './command-execution/bind-pipeline-params';
import { resolvePipelineCommandReference } from './command-execution/resolve-command-reference';
import { normalizeExecutableDescriptor } from './command-execution/normalize-executable';

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
  const guardInputCandidates: unknown[] = [];
  const stageInputVar = env.getVariable?.('input');
  if (stageInputVar) {
    guardInputCandidates.push(stageInputVar);
  }
  if (stageInputs.length > 0) {
    guardInputCandidates.push(...stageInputs);
  }
  if (baseParamNames.length > 0) {
    for (const paramName of baseParamNames) {
      const paramVar = execEnv.getVariable(paramName);
      if (paramVar) {
        guardInputCandidates.push(paramVar);
      }
    }
  }
  const guardInputs = materializeGuardInputs(guardInputCandidates, { nameHint: '__pipeline_stage_input__' });

  const policyEnforcer = new PolicyEnforcer(env.getPolicySummary());
  const execDescriptor = commandVar?.mx ? varMxToSecurityDescriptor(commandVar.mx) : undefined;
  const exeLabels = execDescriptor?.labels ? Array.from(execDescriptor.labels) : [];
  const guardDescriptor = collectInputDescriptor(guardInputs);
  const policyLocation = operationContext?.location ?? hookOptions?.executionContext?.sourceLocation;

  if (execDef.type === 'command' && execDef.commandTemplate) {
    const { interpolate } = await import('../../core/interpreter');
    const { InterpolationContext } = await import('../../core/interpolation-context');
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
    outputPolicyDescriptor = policyEnforcer.applyOutputPolicyLabels(
      undefined,
      { inputTaint, exeLabels }
    );
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
    outputPolicyDescriptor = policyEnforcer.applyOutputPolicyLabels(
      undefined,
      { inputTaint, exeLabels }
    );
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
    outputPolicyDescriptor = policyEnforcer.applyOutputPolicyLabels(
      undefined,
      { inputTaint, exeLabels }
    );
  }

  if (hookNode && operationContext) {
    const hookManager = env.getHookManager();
    preDecision = await hookManager.runPre(hookNode, guardInputs, env, operationContext);
    const guardInputVariable =
      preDecision && preDecision.metadata && (preDecision.metadata as Record<string, unknown>).guardInput;
    try {
      await handleGuardDecision(preDecision, hookNode, env, operationContext);
    } catch (error) {
      if (guardInputVariable) {
        const existingInput = execEnv.getVariable('input');
        if (!existingInput) {
          const clonedInput: Variable = {
            ...(guardInputVariable as Variable),
            name: 'input',
            mx: { ...(guardInputVariable as Variable).mx },
            internal: {
              ...((guardInputVariable as Variable).internal ?? {}),
              isSystem: true,
              isParameter: true
            }
          };
          execEnv.setParameterVariable('input', clonedInput);
        }
      }
      if (whenExprNode) {
        const handled = await handleExecGuardDenial(error, {
          execEnv,
          env,
          whenExprNode
        });
        if (handled) {
          return finalizeResult(handled.value ?? handled.stdout ?? '');
        }
      }
      throw error;
    }
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
    // Interpolate command template with parameters
    const { interpolate } = await import('../../core/interpreter');
    const { InterpolationContext } = await import('../../core/interpolation-context');
    const command = await interpolate(execDef.commandTemplate, execEnv, InterpolationContext.ShellCommand);
    const scopedEnvConfig = resolveEnvironmentConfig(execEnv, preDecision?.metadata);
    const resolvedEnvConfig = applyEnvironmentDefaults(scopedEnvConfig, execEnv.getPolicySummary());
    const outputDescriptor = buildEnvironmentOutputDescriptor(command, resolvedEnvConfig);
    const mergedOutputDescriptor = outputPolicyDescriptor
      ? outputDescriptor
        ? env.mergeSecurityDescriptors(outputDescriptor, outputPolicyDescriptor)
        : outputPolicyDescriptor
      : outputDescriptor;

    const applyOutputDescriptor = (value: CommandExecutionResult): CommandExecutionResult => {
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

    // Always pass pipeline input as stdin when available
    const usingParts = await resolveUsingEnvParts(execEnv, execDef.withClause);
    const envAuthSecrets = await resolveEnvironmentAuthSecrets(execEnv, resolvedEnvConfig);
    const envAuthDescriptor = buildAuthDescriptor(resolvedEnvConfig?.auth);
    const envInputDescriptor = mergeInputDescriptors(usingParts.descriptor, envAuthDescriptor);
    const envInputTaint = descriptorToInputTaint(envInputDescriptor);
    if (envInputTaint.length > 0) {
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
    if (withClause) {
      if (withClause.pipeline && withClause.pipeline.length > 0) {
        const { processPipeline } = await import('./unified-processor');
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
          return 'retry';
        }
        if (processed && typeof processed === 'object' && (processed as any).value === 'retry') {
          return processed as RetrySignal;
        }
        commandOutput = processed;
      }
    }

    return applyOutputDescriptor(finalizeResult(commandOutput));
  } else if (execDef.type === 'code' && execDef.codeTemplate) {
    // Special handling for mlld-when expressions
    if (execDef.language === 'mlld-when') {
      // The codeTemplate contains the WhenExpression node
      const whenExprNode = execDef.codeTemplate[0];
      if (!whenExprNode || whenExprNode.type !== 'WhenExpression') {
        throw new Error('mlld-when executable missing WhenExpression node');
      }
      
      // Evaluate the when expression with the parameter environment
      const { evaluateWhenExpression } = await import('../when-expression');
      const whenResult = await evaluateWhenExpression(whenExprNode, execEnv);
      
      // Check if this is a retry signal
      let resultValue = whenResult.value;
      if (resultValue && typeof resultValue === 'object' && resultValue.value === 'retry') {
        // This is a retry signal - return it as-is for the pipeline to handle
        return resultValue;
      }
      if (resultValue === 'retry') {
        return 'retry';
      }
      
      const normalized = normalizeWhenShowEffect(resultValue);
      resultValue = normalized.normalized;

      const inPipeline = !!env.getPipelineContext();
      if (inPipeline && normalized.hadShowEffect) {
        // If this is the last stage, suppress echo to avoid showing seed text.
        // If there are more stages, propagate input forward to keep pipeline alive.
        const pmx = env.getPipelineContext?.();
        const isLastStage = pmx && typeof pmx.stage === 'number' && typeof pmx.totalStages === 'number'
          ? pmx.stage >= pmx.totalStages
          : false;
        return finalizeResult(isLastStage ? '' : (stdinInput || ''));
      }

      // Check if the result needs interpolation (wrapped template)
      if (resultValue && typeof resultValue === 'object' && 'wrapperType' in resultValue && Array.isArray(resultValue.content)) {
        // This is a wrapped template that needs interpolation
        const { interpolate } = await import('../../core/interpreter');
        try {
          resultValue = await interpolate(resultValue.content, execEnv);
        } catch (e) {
          resultValue = String(resultValue);
        }
      }
      // Return the result in the configured format
      return finalizeResult(resultValue ?? '');
    } else if (execDef.language === 'mlld-foreach') {
      const foreachNode = execDef.codeTemplate[0];
      const { evaluateForeachCommand } = await import('../foreach');
      const results = await evaluateForeachCommand(foreachNode, execEnv);
      const normalized = results.map(item => {
        if (isStructuredValue(item)) {
          return item.data ?? item.text;
        }
        if (typeof item === 'string' || item instanceof String) {
          const strValue = item instanceof String ? item.valueOf() : item;
          try {
            return JSON.parse(strValue as string);
          } catch {
            return strValue;
          }
        }
        return item;
      });
      const text = (() => {
        try {
          return JSON.stringify(normalized);
        } catch {
          return String(normalized);
        }
      })();
      return finalizeResult(normalized, { type: 'array', text });
    } else if (execDef.language === 'mlld-for') {
      const forNode = execDef.codeTemplate[0];
      const { evaluateForExpression } = await import('../for');
      const arrayVar = await evaluateForExpression(forNode, execEnv);
      const { extractVariableValue } = await import('../../utils/variable-resolution');
      const value = await extractVariableValue(arrayVar, execEnv);
      const text = (() => {
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      })();
      return finalizeResult(value, { type: 'array', text });
    } else if (execDef.language === 'mlld-loop') {
      const loopNode = execDef.codeTemplate[0];
      if (!loopNode || loopNode.type !== 'LoopExpression') {
        throw new Error('mlld-loop executable missing LoopExpression node');
      }
      const { evaluateLoopExpression } = await import('../loop');
      const value = await evaluateLoopExpression(loopNode, execEnv);
      const text = (() => {
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      })();
      const type = Array.isArray(value) ? 'array' : typeof value === 'object' && value !== null ? 'object' : 'text';
      return finalizeResult(value, { type, text });
    }
    
    // Regular JavaScript/code execution
    const { interpolate } = await import('../../core/interpreter');
    const { InterpolationContext } = await import('../../core/interpolation-context');
    
    const code = await interpolate(execDef.codeTemplate, execEnv, InterpolationContext.Default);
    
    // Build parameters object from bound variables
    const params: Record<string, any> = {};
    if (execDef.paramNames) {
      for (const paramName of execDef.paramNames) {
        const paramVar = execEnv.getVariable(paramName);
        if (paramVar) {
          if (paramVar.type === 'pipeline-input') {
            params[paramName] = paramVar.value;
          } else if (
            (paramVar.internal?.isPipelineInput && paramVar.internal?.pipelineInput)
          ) {
            params[paramName] =
              paramVar.internal?.pipelineInput;
          } else {
            params[paramName] = paramVar.value;
          }
        }
      }
    }

    const result = await env.executeCode(
      code,
      execDef.language || 'javascript',
      params,
      undefined,
      workingDirectory ? { workingDirectory } : undefined,
      executionContext
    );

    // If the function returns a StructuredValue-like object, preserve it directly
    if (result && typeof result === 'object' && 'text' in result && 'type' in result) {
      const text =
        typeof (result as any).text === 'string'
          ? (result as any).text
          : String((result as any).text ?? '');
      const type =
        typeof (result as any).type === 'string' ? (result as any).type : undefined;
      return finalizeResult(result, { type, text });
    }

    // Auto-parse JSON-like strings in pipeline context
    if (
      typeof result === 'string' &&
      pipelineCtx !== undefined &&
      !format &&
      shouldAutoParsePipelineInput(stageLanguage)
    ) {
      const wrapped = wrapJsonLikeString(result);
      if (wrapped) {
        return finalizeResult(wrapped);
      }
    }

    return finalizeResult(result);
  } else if (execDef.type === 'nodeFunction') {
    const errorLocation = hookOptions?.executionContext?.sourceLocation ?? commandVar?.mx?.definedAt;
    let callArgs: unknown[];
    if (baseParamNames.length > 0) {
      callArgs = baseParamNames.map(paramName => execEnv.getVariable(paramName)?.value);
    } else {
      callArgs = [...boundArgs];
      if (pipelineCtx !== undefined && stdinInput !== undefined) {
        callArgs.push(structuredInput ?? stdinInput);
      }
      callArgs.push(...args.map(arg => normalizePipelineParameterValue(arg)));
    }
    const jsArgs = callArgs.map(arg => toJsValue(arg));
    let output = execDef.fn.apply(execDef.thisArg ?? undefined, jsArgs);
    if (output && typeof output === 'object' && typeof (output as any).then === 'function') {
      output = await output;
    }

    if (isEventEmitter(output) && !(output && typeof (output as any).then === 'function')) {
      throw new MlldInterpreterError(
        `Node function '${commandVar?.name ?? 'anonymous'}' returns an EventEmitter and requires subscriptions`,
        'exec',
        errorLocation
      );
    }
    if (isLegacyStream(output)) {
      throw new MlldInterpreterError(
        `Node function '${commandVar?.name ?? 'anonymous'}' returns a legacy stream without async iterator support`,
        'exec',
        errorLocation
      );
    }

    const wrapped = wrapNodeValue(output, { moduleName: execDef.moduleName });
    return finalizeResult(wrapped);
  } else if (execDef.type === 'nodeClass') {
    throw new MlldInterpreterError(
      `Node class '${commandVar?.name ?? 'anonymous'}' requires new`,
      'exec',
      hookOptions?.executionContext?.sourceLocation ?? commandVar?.mx?.definedAt
    );
  } else if (execDef.type === 'template' && execDef.template) {
    // Interpolate template
    const { interpolate } = await import('../../core/interpreter');
    const { InterpolationContext } = await import('../../core/interpolation-context');
    
    const result = await interpolate(execDef.template, execEnv, InterpolationContext.Default);
    return result;
  } else if (execDef.type === 'commandRef') {
    /**
     * Handle command references
     * WHY: The reference might be an executable or a parameter/value in the execution scope.
     * CONTEXT: Prefer the execution parameter scope so pipeline parameters (e.g., input) are visible.
     */
    const refAst = execDef.commandRefAst;
    if (refAst) {
      const { evaluateExecInvocation } = await import('../exec-invocation');
      const baseInvocation =
        (refAst as any).type === 'ExecInvocation'
          ? refAst
          : {
              type: 'ExecInvocation',
              commandRef: refAst
            };
      const refInvocation = execDef.withClause ? { ...baseInvocation, withClause: execDef.withClause } : baseInvocation;
      const result = await evaluateExecInvocation(refInvocation as any, execEnv);
      return finalizeResult(result.value);
    }
    const refRaw = execDef.commandRef || '';
    // Use the provided identifier as-is; evaluateExe should have normalized it from AST
    const refName = String(refRaw);

    // Prefer resolving in the execution parameter scope first (execEnv)
    const fromParamScope = (execEnv as Environment).getVariable(refName);

    if (fromParamScope) {
      // If this is an executable, recursively execute it in the same param scope
      if ((fromParamScope as any).type === 'executable') {
        return await executeCommandVariable(fromParamScope as any, execDef.commandArgs ?? [], execEnv, stdinInput, structuredInput, hookOptions);
      }
      // Non-executable reference in exec scope: this is most likely a mistake now that
      // identity bodies compile to template executables.
      const t = (fromParamScope as any).type;
      throw new Error(`Referenced symbol '${refName}' is not executable (type: ${t}). Use a template executable (e.g., \`@${refName}\`) or refactor the definition.`);
    }

    // Fallback to stage environment lookup for global executables/variables
    const refVar = env.getVariable(refName);
    if (!refVar) {
      throw new Error(`Referenced executable not found: ${execDef.commandRef}`);
    }

    if ( (refVar as any).type === 'executable') {
      return await executeCommandVariable(refVar as any, execDef.commandArgs ?? [], env, stdinInput, structuredInput, hookOptions);
    }
    // Non-executable reference in stage env: surface clear guidance
    const t = (refVar as any).type;
    throw new Error(`Referenced symbol '${refName}' is not executable (type: ${t}). Use a template executable or a function.`);
  }
  
  throw new Error(`Unsupported executable type in pipeline: ${execDef.type}`);
}
