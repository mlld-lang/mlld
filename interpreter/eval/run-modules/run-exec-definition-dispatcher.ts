import type { DirectiveNode, ExeBlockNode, MlldNode, WithClause } from '@core/types';
import type { ExecutableDefinition, ExecutableVariable } from '@core/types/executable';
import type { SecurityDescriptor } from '@core/types/security';
import { makeSecurityDescriptor } from '@core/types/security';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import type { EvalResult, EvaluationContext } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import { MlldCommandExecutionError, MlldInterpreterError } from '@core/errors';
import { isExecutableVariable, createSimpleTextVariable } from '@core/types/variable';
import { parseCommand } from '@core/policy/operation-labels';
import type { CommandAnalyzer } from '@security/command/analyzer/CommandAnalyzer';
import type { SecurityManager } from '@security/SecurityManager';
import type { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { logger } from '@core/utils/logger';
import { AutoUnwrapManager } from '@interpreter/eval/auto-unwrap-manager';
import { wrapExecResult } from '@interpreter/utils/structured-exec';
import { deriveExecutableSourceTaintLabel } from '@core/security/taint';
import {
  applySecurityDescriptorToStructuredValue,
  extractSecurityDescriptor,
  normalizeWhenShowEffect
} from '@interpreter/utils/structured-value';
import { executeInWorkingDirectory } from '@interpreter/utils/working-directory';
import { mergeInputDescriptors } from '@interpreter/policy/label-flow-utils';
import {
  buildAuthDescriptor,
  resolveUsingEnvPartsWithOptions
} from '@interpreter/utils/auth-injection';
import {
  isEventEmitter,
  isLegacyStream,
  toJsValue,
  wrapNodeValue
} from '@interpreter/utils/node-interop';
import { enforceKeychainAccess } from '@interpreter/policy/keychain-policy';
import { createTemplateInterpolationEnv } from '@interpreter/eval/exec/template-interpolation-env';
import {
  applyEnvironmentDefaults,
  buildEnvironmentOutputDescriptor,
  executeProviderCommand,
  resolveEnvironmentAuthSecrets,
  resolveEnvironmentConfig
} from '@interpreter/env/environment-provider';
import { mergeAuthUsing, resolveRunCodeOpType } from './run-pure-helpers';
import { createParameterVariable } from '@interpreter/utils/parameter-factory';
import { unwrapExeReturnControl } from '@interpreter/eval/exe-return';
import {
  applyRunOperationContext,
  buildRunCapabilityOperationUpdate,
  buildRunCommandOperationUpdate,
  checkRunInputLabelFlow,
  deriveRunOutputPolicyDescriptor,
  enforceRunCapabilityPolicy,
  enforceRunCommandPolicy,
  shouldEnforceRunAllowList
} from './run-policy-context';
import { VariableMetadataUtils, type Variable } from '@core/types/variable';

export type RunExecInterpolateWithPendingDescriptor = (
  nodes: any,
  interpolationContext?: InterpolationContext,
  targetEnv?: Environment
) => Promise<string>;

export type RunExecDispatcherServices = {
  interpolateWithPendingDescriptor: RunExecInterpolateWithPendingDescriptor;
  // Recursion seam for commandRef fallback to avoid a hard module cycle.
  evaluateRunRecursive: (
    directive: DirectiveNode,
    env: Environment,
    callStack?: string[],
    context?: EvaluationContext
  ) => Promise<EvalResult>;
};

export type RunExecDefinitionDispatchParams = {
  directive: DirectiveNode;
  env: Environment;
  context?: EvaluationContext;
  withClause?: WithClause;
  executionContext: Record<string, unknown>;
  streamingEnabled: boolean;
  pipelineId: string;
  policyEnforcer: PolicyEnforcer;
  policyChecksEnabled: boolean;
  definition: ExecutableDefinition;
  execVar: ExecutableVariable;
  callStack: string[];
  argValues: Record<string, string>;
  argRuntimeValues: Record<string, unknown>;
  argDescriptors: SecurityDescriptor[];
  argOriginalVariables: Record<string, Variable | undefined>;
  argBindingDescriptors: Record<string, SecurityDescriptor | undefined>;
  exeLabels: string[];
  services: RunExecDispatcherServices;
};

export type RunExecDefinitionDispatchResult = {
  value: unknown;
  outputDescriptors: SecurityDescriptor[];
  callStack: string[];
};

export type RunExecArgumentExtractionResult = {
  argValues: Record<string, string>;
  argRuntimeValues: Record<string, unknown>;
  argDescriptors: SecurityDescriptor[];
  argOriginalVariables: Record<string, Variable | undefined>;
  argBindingDescriptors: Record<string, SecurityDescriptor | undefined>;
};

async function resolveRunArgumentOriginalVariable(
  arg: unknown,
  env: Environment,
  evaluatedValue: unknown
): Promise<Variable | undefined> {
  if (!arg || typeof arg !== 'object' || !('type' in arg) || (arg as any).type !== 'VariableReference') {
    return undefined;
  }

  const varRef = arg as any;
  const variable = env.getVariable(varRef.identifier);
  const isWholeVariableReference = !Array.isArray(varRef.fields) || varRef.fields.length === 0;
  if (!variable || !isWholeVariableReference) {
    return undefined;
  }

  const { isTemplate } = await import('@core/types/variable');
  if (isTemplate(variable) && typeof evaluatedValue === 'string') {
    return undefined;
  }

  return variable;
}

function mergeRunArgumentDescriptors(
  env: Environment,
  descriptors: readonly SecurityDescriptor[]
): SecurityDescriptor | undefined {
  if (descriptors.length === 0) {
    return undefined;
  }
  if (descriptors.length === 1) {
    return descriptors[0];
  }
  return env.mergeSecurityDescriptors(...descriptors);
}

export async function extractRunExecArguments(params: {
  directive: DirectiveNode;
  definition: ExecutableDefinition;
  env: Environment;
  interpolateWithPendingDescriptor: RunExecInterpolateWithPendingDescriptor;
}): Promise<RunExecArgumentExtractionResult> {
  const { directive, definition, env, interpolateWithPendingDescriptor } = params;
  const args = directive.values?.args || [];
  const argValues: Record<string, string> = {};
  const argRuntimeValues: Record<string, unknown> = {};
  const argDescriptors: SecurityDescriptor[] = [];
  const argOriginalVariables: Record<string, Variable | undefined> = {};
  const argBindingDescriptors: Record<string, SecurityDescriptor | undefined> = {};
  const paramNames = (definition as any).paramNames as string[] | undefined;
  if (!paramNames || paramNames.length === 0) {
    return {
      argValues,
      argRuntimeValues,
      argDescriptors,
      argOriginalVariables,
      argBindingDescriptors
    };
  }

  const { evaluateExecInvocationArgs } = await import('@interpreter/eval/exec/args');
  const { evaluateExecInvocation } = await import('@interpreter/eval/exec-invocation');
  for (let i = 0; i < paramNames.length; i++) {
    const paramName = paramNames[i];
    const arg = args[i];
    if (arg === undefined) {
      argValues[paramName] = '';
      argRuntimeValues[paramName] = '';
      continue;
    }

    const collectedDescriptors: SecurityDescriptor[] = [];
    const evaluated = await evaluateExecInvocationArgs({
      args: [arg],
      env,
      commandName: ((directive.values as any)?.command as string) || 'run',
      services: {
        interpolate: async (nodes: any[], targetEnv: Environment, context?: InterpolationContext) => {
          return interpolateWithPendingDescriptor(
            nodes,
            context ?? InterpolationContext.Default,
            targetEnv
          );
        },
        evaluateExecInvocation: async (node, targetEnv) => evaluateExecInvocation(node, targetEnv),
        mergeResultDescriptor: descriptor => {
          if (descriptor) {
            collectedDescriptors.push(descriptor);
          }
        }
      }
    });
    const evaluatedString = evaluated.evaluatedArgStrings[0];
    const evaluatedRuntime = evaluated.evaluatedArgs[0];

    if (evaluatedString === undefined) {
      argValues[paramName] = '';
      argRuntimeValues[paramName] = '';
      continue;
    }

    argValues[paramName] = evaluatedString;
    argRuntimeValues[paramName] = evaluatedRuntime;
    argOriginalVariables[paramName] = await resolveRunArgumentOriginalVariable(arg, env, evaluatedRuntime);

    const mergedDescriptor = mergeRunArgumentDescriptors(env, collectedDescriptors);
    if (mergedDescriptor) {
      argDescriptors.push(mergedDescriptor);
      argBindingDescriptors[paramName] = mergedDescriptor;
    }
  }

  return {
    argValues,
    argRuntimeValues,
    argDescriptors,
    argOriginalVariables,
    argBindingDescriptors
  };
}

type RunExecDispatchContext = RunExecDefinitionDispatchParams;

function appendDescriptor(
  descriptors: SecurityDescriptor[],
  descriptor?: SecurityDescriptor
): void {
  if (descriptor) {
    descriptors.push(descriptor);
  }
}

async function applyCapturedModuleEnv(
  targetEnv: Environment,
  execVar: ExecutableVariable
): Promise<Map<string, Variable> | undefined> {
  const rawCaptured = execVar.internal?.capturedModuleEnv;
  if (!rawCaptured) {
    return undefined;
  }

  if (rawCaptured instanceof Map) {
    targetEnv.setCapturedModuleEnv(rawCaptured);
    return rawCaptured;
  }

  if (typeof rawCaptured !== 'object') {
    return undefined;
  }

  const { VariableImporter } = await import('@interpreter/eval/import/VariableImporter');
  const { ObjectReferenceResolver } = await import('@interpreter/eval/import/ObjectReferenceResolver');
  const importer = new VariableImporter(new ObjectReferenceResolver());
  const moduleEnvMap = importer.deserializeModuleEnv(rawCaptured, targetEnv);

  execVar.internal = {
    ...(execVar.internal ?? {}),
    capturedModuleEnv: moduleEnvMap
  };
  targetEnv.setCapturedModuleEnv(moduleEnvMap);
  return moduleEnvMap;
}

function bindRunParameterVariable(
  targetEnv: Environment,
  name: string,
  value: unknown,
  stringValue: string,
  options?: {
    originalVariable?: Variable;
    descriptor?: SecurityDescriptor;
  }
): void {
  const metadata = options?.descriptor
    ? VariableMetadataUtils.applySecurityMetadata(undefined, {
        existingDescriptor: options.descriptor
      })
    : undefined;
  const parameter = createParameterVariable({
    name,
    value,
    stringValue,
    originalVariable: options?.originalVariable,
    allowOriginalReuse: Boolean(options?.originalVariable),
    origin: 'directive',
    metadataFactory: () => ({
      ...(metadata ? { metadata } : {}),
      internal: {
        isSystem: true,
        isParameter: true
      }
    })
  });

  if (parameter) {
    targetEnv.setParameterVariable(name, parameter);
    return;
  }

  targetEnv.setParameterVariable(name, createSimpleTextVariable(name, stringValue));
}

function bindRunParameterVariables(
  targetEnv: Environment,
  argValues: Record<string, string>,
  argRuntimeValues: Record<string, unknown>,
  argOriginalVariables: Record<string, Variable | undefined>,
  argBindingDescriptors: Record<string, SecurityDescriptor | undefined>
): void {
  for (const [key, stringValue] of Object.entries(argValues)) {
    bindRunParameterVariable(targetEnv, key, argRuntimeValues[key], stringValue, {
      originalVariable: argOriginalVariables[key],
      descriptor: argBindingDescriptors[key]
    });
  }
}

async function handleCommandDefinition(
  ctx: RunExecDispatchContext
): Promise<RunExecDefinitionDispatchResult> {
  const {
    directive,
    env,
    context,
    withClause,
    executionContext,
    streamingEnabled,
    pipelineId,
    policyEnforcer,
    policyChecksEnabled,
    definition,
    execVar,
    argValues,
    argRuntimeValues,
    argDescriptors,
    argOriginalVariables,
    argBindingDescriptors,
    exeLabels,
    callStack,
    services
  } = ctx;

  const outputDescriptors: SecurityDescriptor[] = [];
  const sourceTaintLabel = deriveExecutableSourceTaintLabel({
    type: 'command'
  });
  appendDescriptor(
    outputDescriptors,
    sourceTaintLabel ? makeSecurityDescriptor({ taint: [sourceTaintLabel] }) : undefined
  );
  const tempEnv = env.createChild();
  await applyCapturedModuleEnv(tempEnv, execVar);
  bindRunParameterVariables(tempEnv, argValues, argRuntimeValues, argOriginalVariables, argBindingDescriptors);

  const workingDirectory = await executeInWorkingDirectory(
    (definition as any)?.workingDir,
    tempEnv,
    async resolvedPath => resolvedPath,
    { sourceLocation: directive.location, directiveType: 'run' }
  );
  const effectiveWorkingDirectory = workingDirectory || env.getExecutionDirectory();

  const cleanTemplate = (definition as any).commandTemplate.map((seg: MlldNode, idx: number) => {
    if (idx === 0 && seg.type === 'Text' && 'content' in seg && seg.content.startsWith('[')) {
      return { ...seg, content: seg.content.substring(1) };
    }
    return seg;
  });

  const command = await services.interpolateWithPendingDescriptor(
    cleanTemplate,
    InterpolationContext.ShellCommand,
    tempEnv
  );

  const parsedCommand = parseCommand(command);
  const opUpdate = buildRunCommandOperationUpdate(
    command,
    (context?.operationContext?.metadata ?? {}) as Record<string, unknown>
  );
  applyRunOperationContext(env, context, opUpdate);
  const opLabels = (opUpdate.opLabels ?? []) as string[];

  enforceRunCommandPolicy(
    env.getPolicySummary(),
    command,
    env,
    directive.location ?? undefined,
    {
      enforceAllowList: shouldEnforceRunAllowList(context?.operationContext)
    }
  );

  const inputDescriptor =
    argDescriptors.length > 0 ? env.mergeSecurityDescriptors(...argDescriptors) : undefined;
  const inputTaint = checkRunInputLabelFlow({
    descriptor: inputDescriptor,
    policyEnforcer,
    policyChecksEnabled,
    operationContext: context?.operationContext,
    opLabels,
    exeLabels,
    flowChannel: 'arg',
    command: parsedCommand.command,
    env,
    sourceLocation: directive.location ?? undefined
  });
  appendDescriptor(
    outputDescriptors,
    deriveRunOutputPolicyDescriptor({
      policyEnforcer,
      inputTaint,
      exeLabels
    })
  );

  const scopedEnvConfig = resolveEnvironmentConfig(env, context?.guardMetadata);
  const resolvedEnvConfig = applyEnvironmentDefaults(scopedEnvConfig, env.getPolicySummary());
  appendDescriptor(outputDescriptors, buildEnvironmentOutputDescriptor(command, resolvedEnvConfig));

  const security = env.getSecurityManager();
  if (security) {
    const securityManager = security as SecurityManager & { commandAnalyzer?: CommandAnalyzer };
    const analyzer = securityManager.commandAnalyzer;
    if (analyzer) {
      const analysis = await analyzer.analyze(command);
      if (analysis.blocked) {
        const reason = analysis.risks?.[0]?.description || 'Security policy violation';
        throw new MlldCommandExecutionError(
          `Security: Exec command blocked - ${reason}`,
          directive.location,
          {
            command,
            exitCode: 1,
            duration: 0,
            stderr: `This exec command is blocked by security policy: ${reason}`,
            workingDirectory: effectiveWorkingDirectory,
            directiveType: 'run'
          },
          env
        );
      }
    }
  }

  const authResolutionOptions = {
    capturedAuthBindings: (execVar.internal as any)?.capturedAuthBindings as
      | Record<string, unknown>
      | undefined
  };
  const usingParts = await resolveUsingEnvPartsWithOptions(
    tempEnv,
    authResolutionOptions,
    (definition as any).withClause,
    withClause
  );
  const envAuthSecrets = await resolveEnvironmentAuthSecrets(
    tempEnv,
    resolvedEnvConfig,
    authResolutionOptions
  );
  const envAuthDescriptor = buildAuthDescriptor(resolvedEnvConfig?.auth);
  const envInputDescriptor = mergeInputDescriptors(usingParts.descriptor, envAuthDescriptor);
  checkRunInputLabelFlow({
    descriptor: envInputDescriptor,
    policyEnforcer,
    policyChecksEnabled,
    operationContext: context?.operationContext,
    opLabels,
    exeLabels,
    flowChannel: 'using',
    command: parsedCommand.command,
    env,
    sourceLocation: directive.location ?? undefined
  });

  if (resolvedEnvConfig?.provider) {
    const providerResult = await executeProviderCommand({
      env: tempEnv,
      providerRef: resolvedEnvConfig.provider,
      config: resolvedEnvConfig,
      command,
      workingDirectory,
      vars: usingParts.vars,
      secrets: {
        ...envAuthSecrets,
        ...usingParts.secrets
      },
      executionContext: {
        ...executionContext,
        streamingEnabled,
        pipelineId,
        workingDirectory,
        exeLabels
      },
      sourceLocation: directive.location ?? null,
      directiveType: 'run'
    });
    return {
      value: providerResult.stdout ?? '',
      outputDescriptors,
      callStack
    };
  }

  const injectedEnv = {
    ...envAuthSecrets,
    ...usingParts.merged
  };
  const commandOptions =
    workingDirectory || Object.keys(injectedEnv).length > 0
      ? {
          ...(workingDirectory ? { workingDirectory } : {}),
          ...(Object.keys(injectedEnv).length > 0 ? { env: injectedEnv } : {})
        }
      : undefined;
  const value = await env.executeCommand(command, commandOptions, {
    ...executionContext,
    streamingEnabled,
    pipelineId,
    workingDirectory,
    exeLabels
  });
  return { value, outputDescriptors, callStack };
}

async function handleCommandRefDefinition(
  ctx: RunExecDispatchContext
): Promise<RunExecDefinitionDispatchResult> {
  const {
    directive,
    env,
    context,
    withClause,
    definition,
    execVar,
    argValues,
    argRuntimeValues,
    argOriginalVariables,
    argBindingDescriptors,
    callStack,
    services
  } = ctx;

  const refAst = (definition as any).commandRefAst;
  if (refAst) {
    const { evaluateExecInvocation } = await import('@interpreter/eval/exec-invocation');
    const execEnv = env.createChild();
    await applyCapturedModuleEnv(execEnv, execVar);
    bindRunParameterVariables(
      execEnv,
      argValues,
      argRuntimeValues,
      argOriginalVariables,
      argBindingDescriptors
    );
    const mergedAuthUsing = mergeAuthUsing((definition as any).withClause as WithClause | undefined, withClause);
    const refWithClause = mergedAuthUsing
      ? { ...(withClause || {}), ...mergedAuthUsing }
      : withClause;
    const baseInvocation =
      (refAst as any).type === 'ExecInvocation'
        ? refAst
        : {
            type: 'ExecInvocation',
            commandRef: refAst
          };
    const refInvocation = refWithClause ? { ...baseInvocation, withClause: refWithClause } : baseInvocation;
    const result = await evaluateExecInvocation(refInvocation as any, execEnv);
    return {
      value: result.value,
      outputDescriptors: [],
      callStack
    };
  }

  const refCommand = (definition as any).commandRef as string;
  const refExecVar = env.getVariable(refCommand);
  if (!refExecVar || !isExecutableVariable(refExecVar)) {
    throw new Error(`Referenced executable not found: ${refCommand}`);
  }

  if (callStack.includes(refCommand)) {
    const cycle = [...callStack, refCommand].join(' -> ');
    throw new Error(`Circular command reference detected: ${cycle}`);
  }

  const refDirective = {
    ...directive,
    values: {
      ...directive.values,
      identifier: [{ type: 'VariableReference', identifier: refCommand }],
      args: (definition as any).commandArgs
    }
  };
  const mergedAuthUsing = mergeAuthUsing((definition as any).withClause as WithClause | undefined, withClause);
  const refWithClause = mergedAuthUsing
    ? { ...(withClause || {}), ...mergedAuthUsing }
    : withClause;
  if (refWithClause) {
    (refDirective.values as any).withClause = refWithClause;
    refDirective.meta = { ...directive.meta, withClause: refWithClause };
  }

  const result = await services.evaluateRunRecursive(refDirective as DirectiveNode, env, callStack, context);
  return {
    value: result.value,
    outputDescriptors: [],
    callStack
  };
}

async function handleBuiltinTransformerDefinition(
  ctx: RunExecDispatchContext
): Promise<RunExecDefinitionDispatchResult> {
  const { directive, env, execVar, callStack, services } = ctx;
  const args = directive.values?.args || [];
  const evaluatedArgs: any[] = [];

  for (const arg of args) {
    if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
      evaluatedArgs.push(arg);
    } else if (arg && typeof arg === 'object' && 'type' in arg) {
      const argValue = await services.interpolateWithPendingDescriptor([arg], InterpolationContext.Default);
      evaluatedArgs.push(argValue);
    } else {
      evaluatedArgs.push(arg);
    }
  }

  const keychainFunction = execVar.internal?.keychainFunction;
  if (keychainFunction) {
    const service = String(evaluatedArgs[0] ?? '');
    const account = String(evaluatedArgs[1] ?? '');
    if (!service || !account) {
      throw new MlldInterpreterError('Keychain access requires service and account', {
        code: 'KEYCHAIN_PATH_INVALID'
      });
    }
    enforceKeychainAccess(env, { service, account, action: keychainFunction }, directive.location);
  }

  const result = await execVar.internal.transformerImplementation!(evaluatedArgs);
  if (keychainFunction === 'get' && result !== null && result !== undefined) {
    const keychainDescriptor = makeSecurityDescriptor({
      labels: ['secret'],
      taint: ['secret', 'src:keychain'],
      sources: ['keychain.get']
    });
    const existingDescriptor = extractSecurityDescriptor(result, {
      recursive: true,
      mergeArrayElements: true
    });
    const mergedDescriptor = existingDescriptor
      ? env.mergeSecurityDescriptors(existingDescriptor, keychainDescriptor)
      : keychainDescriptor;
    const wrapped = wrapExecResult(result);
    applySecurityDescriptorToStructuredValue(wrapped, mergedDescriptor);
    return {
      value: wrapped,
      outputDescriptors: [],
      callStack
    };
  }

  return {
    value: result,
    outputDescriptors: [],
    callStack
  };
}

async function handleCodeDefinition(
  ctx: RunExecDispatchContext
): Promise<RunExecDefinitionDispatchResult> {
  const {
    directive,
    env,
    context,
    withClause,
    executionContext,
    streamingEnabled,
    pipelineId,
    policyEnforcer,
    policyChecksEnabled,
    definition,
    execVar,
    argValues,
    argRuntimeValues,
    argDescriptors,
    argOriginalVariables,
    argBindingDescriptors,
    exeLabels,
    callStack,
    services
  } = ctx;

  const outputDescriptors: SecurityDescriptor[] = [];
  const sourceTaintLabel = deriveExecutableSourceTaintLabel({
    type: 'code',
    language: (definition as any).language
  });
  appendDescriptor(
    outputDescriptors,
    sourceTaintLabel ? makeSecurityDescriptor({ taint: [sourceTaintLabel] }) : undefined
  );
  const tempEnv = env.createChild();
  await applyCapturedModuleEnv(tempEnv, execVar);
  bindRunParameterVariables(tempEnv, argValues, argRuntimeValues, argOriginalVariables, argBindingDescriptors);
  const workingDirectory = await executeInWorkingDirectory(
    (definition as any)?.workingDir,
    tempEnv,
    async resolvedPath => resolvedPath,
    { sourceLocation: directive.location, directiveType: 'run' }
  );

  const codeParams = { ...argRuntimeValues } as Record<string, unknown>;
  const definitionArgDescriptors: SecurityDescriptor[] = [];
  const definitionArgs = Array.isArray((definition as any).args) ? ((definition as any).args as MlldNode[]) : [];

  if (definitionArgs.length > 0) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');

    for (let index = 0; index < definitionArgs.length; index += 1) {
      const argNode = definitionArgs[index] as any;
      if (argNode && typeof argNode === 'object' && argNode.type === 'VariableReference') {
        const varName = argNode.identifier;
        const variable = tempEnv.getVariable(varName);
        if (!variable) {
          throw new MlldInterpreterError(`Variable not found: ${varName}`);
        }
        const descriptor = extractSecurityDescriptor(variable, {
          recursive: true,
          mergeArrayElements: true
        });
        if (descriptor) {
          definitionArgDescriptors.push(descriptor);
        }
        const runtimeValue = AutoUnwrapManager.unwrap(await extractVariableValue(variable, tempEnv));
        codeParams[varName] = runtimeValue;
        argValues[varName] = typeof runtimeValue === 'string' ? runtimeValue : String(runtimeValue ?? '');
        continue;
      }

      const evaluatedArg = await evaluate(argNode, tempEnv, { isExpression: true });
      const descriptor = extractSecurityDescriptor(evaluatedArg.value, {
        recursive: true,
        mergeArrayElements: true
      });
      if (descriptor) {
        definitionArgDescriptors.push(descriptor);
      }
      const runtimeValue = AutoUnwrapManager.unwrap(evaluatedArg.value);
      const fallbackKey = `arg${index}`;
      codeParams[fallbackKey] = runtimeValue;
      argValues[fallbackKey] = typeof runtimeValue === 'string' ? runtimeValue : String(runtimeValue ?? '');
    }
  }

  const capturedEnvs = execVar.internal?.capturedShadowEnvs;
  if (
    capturedEnvs &&
    ((definition as any).language === 'js' ||
      (definition as any).language === 'javascript' ||
      (definition as any).language === 'node' ||
      (definition as any).language === 'nodejs')
  ) {
    codeParams.__capturedShadowEnvs = capturedEnvs;
  }

  const opType = resolveRunCodeOpType((definition as any).language ?? '');
  let opLabels: string[] = [];
  if (opType) {
    const opUpdate = buildRunCapabilityOperationUpdate(opType);
    applyRunOperationContext(env, context, opUpdate);
    opLabels = (opUpdate.opLabels ?? []) as string[];
  }
  if (opType) {
    enforceRunCapabilityPolicy(
      env.getPolicySummary(),
      opType,
      env,
      directive.location ?? undefined,
      {
        enforceAllowList: shouldEnforceRunAllowList(context?.operationContext)
      }
    );
  }
  const allArgDescriptors =
    definitionArgDescriptors.length > 0
      ? [...argDescriptors, ...definitionArgDescriptors]
      : argDescriptors;
  const inputDescriptor =
    allArgDescriptors.length > 0 ? env.mergeSecurityDescriptors(...allArgDescriptors) : undefined;
  const inputTaint = checkRunInputLabelFlow({
    descriptor: inputDescriptor,
    policyEnforcer,
    policyChecksEnabled: policyChecksEnabled && Boolean(opType),
    operationContext: context?.operationContext,
    opLabels,
    exeLabels,
    flowChannel: 'arg',
    env,
    sourceLocation: directive.location ?? undefined
  });
  appendDescriptor(
    outputDescriptors,
    deriveRunOutputPolicyDescriptor({
      policyEnforcer,
      inputTaint,
      exeLabels
    })
  );

  if ((definition as any).language === 'mlld-when') {
    const whenExprNode = (definition as any).codeTemplate[0];
    if (!whenExprNode || whenExprNode.type !== 'WhenExpression') {
      throw new Error('mlld-when executable missing WhenExpression node');
    }

    const execEnv = env.createChild();
    if (exeLabels.length > 0) {
      execEnv.setExeLabels(exeLabels);
    }
    await applyCapturedModuleEnv(execEnv, execVar);
    for (const [key, value] of Object.entries(codeParams)) {
      bindRunParameterVariable(execEnv, key, value, argValues[key] ?? '', {
        originalVariable: argOriginalVariables[key],
        descriptor: argBindingDescriptors[key]
      });
    }

    const { evaluateWhenExpression } = await import('@interpreter/eval/when-expression');
    const whenResult = await evaluateWhenExpression(whenExprNode, execEnv);
    const normalized = normalizeWhenShowEffect(unwrapExeReturnControl(whenResult.value));

    return {
      value: normalized.normalized,
      outputDescriptors,
      callStack
    };
  }

  if ((definition as any).language === 'mlld-exe-block') {
    const blockNode = Array.isArray((definition as any).codeTemplate)
      ? ((definition as any).codeTemplate[0] as ExeBlockNode | undefined)
      : undefined;
    if (!blockNode || !blockNode.values) {
      throw new Error('mlld-exe-block executable missing block content');
    }

    const execEnv = env.createChild();
    if (exeLabels.length > 0) {
      execEnv.setExeLabels(exeLabels);
    }
    await applyCapturedModuleEnv(execEnv, execVar);
    for (const [key, value] of Object.entries(codeParams)) {
      bindRunParameterVariable(execEnv, key, value, argValues[key] ?? '', {
        originalVariable: argOriginalVariables[key],
        descriptor: argBindingDescriptors[key]
      });
    }

    const { evaluateExeBlock } = await import('@interpreter/eval/exe');
    const blockResult = await evaluateExeBlock(blockNode, execEnv);
    return {
      value: unwrapExeReturnControl(blockResult.value),
      outputDescriptors,
      callStack
    };
  }

  if ((definition as any).language === 'mlld-box') {
    const envDirectiveNode = Array.isArray((definition as any).codeTemplate)
      ? ((definition as any).codeTemplate[0] as any)
      : undefined;
    if (!envDirectiveNode || envDirectiveNode.type !== 'Directive' || envDirectiveNode.kind !== 'box') {
      throw new Error('mlld-box executable missing box directive');
    }

    const execEnv = env.createChild();
    if (exeLabels.length > 0) {
      execEnv.setExeLabels(exeLabels);
    }
    await applyCapturedModuleEnv(execEnv, execVar);
    for (const [key, value] of Object.entries(codeParams)) {
      bindRunParameterVariable(execEnv, key, value, argValues[key] ?? '', {
        originalVariable: argOriginalVariables[key],
        descriptor: argBindingDescriptors[key]
      });
    }

    const { evaluateBox } = await import('@interpreter/eval/box');
    const boxResult = await evaluateBox(envDirectiveNode, execEnv);
    return {
      value: unwrapExeReturnControl(boxResult.value),
      outputDescriptors,
      callStack
    };
  }

  const code = await services.interpolateWithPendingDescriptor(
    (definition as any).codeTemplate,
    InterpolationContext.ShellCommand,
    tempEnv
  );

  const usingParts = await resolveUsingEnvPartsWithOptions(
    tempEnv,
    {
      capturedAuthBindings: (execVar.internal as any)?.capturedAuthBindings as
        | Record<string, unknown>
        | undefined
    },
    (definition as any).withClause,
    withClause
  );
  const envInputDescriptor = mergeInputDescriptors(usingParts.descriptor);
  checkRunInputLabelFlow({
    descriptor: envInputDescriptor,
    policyEnforcer,
    policyChecksEnabled: Boolean(opType),
    operationContext: context?.operationContext,
    opLabels,
    exeLabels,
    flowChannel: 'using',
    env,
    sourceLocation: directive.location ?? undefined
  });

  const injectedEnv = usingParts.merged;
  const codeOptions =
    workingDirectory || Object.keys(injectedEnv).length > 0
      ? {
          ...(workingDirectory ? { workingDirectory } : {}),
          ...(Object.keys(injectedEnv).length > 0 ? { env: injectedEnv } : {})
        }
      : undefined;

  const value = await AutoUnwrapManager.executeWithPreservation(async () => {
    return env.executeCode(
      code,
      (definition as any).language || 'javascript',
      codeParams,
      undefined,
      codeOptions,
      {
        ...executionContext,
        streamingEnabled,
        pipelineId,
        workingDirectory
      }
    );
  });
  return {
    value,
    outputDescriptors,
    callStack
  };
}

async function handleTemplateDefinition(
  ctx: RunExecDispatchContext
): Promise<RunExecDefinitionDispatchResult> {
  const {
    env,
    definition,
    argValues,
    argRuntimeValues,
    argOriginalVariables,
    argBindingDescriptors,
    callStack,
    services,
    execVar
  } = ctx;
  const tempEnv = createTemplateInterpolationEnv(env.createChild(), definition);
  await applyCapturedModuleEnv(tempEnv, execVar);
  bindRunParameterVariables(tempEnv, argValues, argRuntimeValues, argOriginalVariables, argBindingDescriptors);

  const templateOutput = await services.interpolateWithPendingDescriptor(
    (definition as any).template,
    InterpolationContext.Default,
    tempEnv
  );
  const sourceTaintLabel = deriveExecutableSourceTaintLabel({ type: 'template' });
  return {
    value: templateOutput,
    outputDescriptors: sourceTaintLabel
      ? [makeSecurityDescriptor({ taint: [sourceTaintLabel] })]
      : [],
    callStack
  };
}

async function handleNodeFunctionDefinition(
  ctx: RunExecDispatchContext
): Promise<RunExecDefinitionDispatchResult> {
  const { definition, execVar, argValues, argRuntimeValues, env, callStack } = ctx;

  if (definition.type === 'nodeClass') {
    throw new MlldInterpreterError(
      `Node class '${execVar.name ?? 'anonymous'}' requires new`,
      'run',
      ctx.directive.location ?? undefined
    );
  }

  const orderedArgs = (definition.paramNames ?? []).map(paramName =>
    Object.prototype.hasOwnProperty.call(argRuntimeValues, paramName)
      ? argRuntimeValues[paramName]
      : argValues[paramName]
  );
  const preserveStructuredArgs = execVar.internal?.preserveStructuredArgs === true;
  const jsArgs = preserveStructuredArgs ? orderedArgs : orderedArgs.map(arg => toJsValue(arg));

  if (definition.bindExecutionEnv) {
    jsArgs.push(env);
  }

  let output = definition.fn.apply(definition.thisArg ?? undefined, jsArgs);
  if (output && typeof output === 'object' && typeof (output as any).then === 'function') {
    output = await output;
  }

  if (isEventEmitter(output) && !(output && typeof (output as any).then === 'function')) {
    throw new MlldInterpreterError(
      `Node function '${execVar.name ?? 'anonymous'}' returns an EventEmitter and requires subscriptions`,
      'run',
      ctx.directive.location ?? undefined
    );
  }
  if (isLegacyStream(output)) {
    throw new MlldInterpreterError(
      `Node function '${execVar.name ?? 'anonymous'}' returns a legacy stream without async iterator support`,
      'run',
      ctx.directive.location ?? undefined
    );
  }

  return {
    value: wrapNodeValue(output, { moduleName: definition.moduleName }),
    outputDescriptors: [],
    callStack
  };
}

async function handleProseDefinition(
  ctx: RunExecDispatchContext
): Promise<RunExecDefinitionDispatchResult> {
  const { definition, argValues, env, callStack } = ctx;
  const { executeProseExecutable } = await import('@interpreter/eval/prose-execution');
  const proseResult = await executeProseExecutable(definition as any, argValues, env);
  return {
    value: proseResult,
    outputDescriptors: [],
    callStack
  };
}

export async function dispatchRunExecutableDefinition(
  params: RunExecDefinitionDispatchParams
): Promise<RunExecDefinitionDispatchResult> {
  const { definition, execVar } = params;

  if (definition.type === 'command' && 'commandTemplate' in definition) {
    return handleCommandDefinition(params);
  }

  if (definition.type === 'commandRef') {
    return handleCommandRefDefinition(params);
  }

  if (execVar.internal?.isBuiltinTransformer && execVar.internal?.transformerImplementation) {
    return handleBuiltinTransformerDefinition(params);
  }

  if (definition.type === 'code') {
    return handleCodeDefinition(params);
  }

  if (definition.type === 'template') {
    return handleTemplateDefinition(params);
  }

  if (definition.type === 'nodeFunction' || definition.type === 'nodeClass') {
    return handleNodeFunctionDefinition(params);
  }

  if (definition.type === 'prose') {
    return handleProseDefinition(params);
  }

  throw new Error(`Unsupported executable type: ${definition.type}`);
}
