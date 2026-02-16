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
import {
  applySecurityDescriptorToStructuredValue,
  extractSecurityDescriptor,
  normalizeWhenShowEffect
} from '@interpreter/utils/structured-value';
import { resolveWorkingDirectory } from '@interpreter/utils/working-directory';
import { mergeInputDescriptors } from '@interpreter/policy/label-flow-utils';
import { buildAuthDescriptor, resolveUsingEnvParts } from '@interpreter/utils/auth-injection';
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
import {
  applyRunOperationContext,
  buildRunCapabilityOperationUpdate,
  buildRunCommandOperationUpdate,
  checkRunInputLabelFlow,
  deriveRunOutputPolicyDescriptor,
  enforceRunCapabilityPolicy,
  enforceRunCommandPolicy
} from './run-policy-context';

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
};

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
  const paramNames = (definition as any).paramNames as string[] | undefined;
  if (!paramNames || paramNames.length === 0) {
    return { argValues, argRuntimeValues, argDescriptors };
  }

  const { evaluateExecInvocationArgs } = await import('@interpreter/eval/exec/args');
  const { evaluateExecInvocation } = await import('@interpreter/eval/exec-invocation');
  const collectedDescriptors: SecurityDescriptor[] = [];
  const evaluated = await evaluateExecInvocationArgs({
    args,
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

  for (let i = 0; i < paramNames.length; i++) {
    const paramName = paramNames[i];
    const evaluatedString = evaluated.evaluatedArgStrings[i];
    const evaluatedRuntime = evaluated.evaluatedArgs[i];

    if (evaluatedString === undefined) {
      argValues[paramName] = '';
      argRuntimeValues[paramName] = '';
      continue;
    }

    argValues[paramName] = evaluatedString;
    argRuntimeValues[paramName] = evaluatedRuntime;
  }

  if (collectedDescriptors.length > 0) {
    argDescriptors.push(...collectedDescriptors);
  }

  return { argValues, argRuntimeValues, argDescriptors };
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

function bindRunParameterVariable(
  targetEnv: Environment,
  name: string,
  value: unknown,
  stringValue: string
): void {
  const parameter = createParameterVariable({
    name,
    value,
    stringValue,
    origin: 'directive',
    metadataFactory: () => ({
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
    argValues,
    argRuntimeValues,
    argDescriptors,
    exeLabels,
    callStack,
    services
  } = ctx;

  const outputDescriptors: SecurityDescriptor[] = [];
  const tempEnv = env.createChild();
  for (const [key, stringValue] of Object.entries(argValues)) {
    bindRunParameterVariable(tempEnv, key, argRuntimeValues[key], stringValue);
  }

  const workingDirectory = await resolveWorkingDirectory(
    (definition as any)?.workingDir,
    tempEnv,
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
    directive.location ?? undefined
  );

  const inputDescriptor =
    argDescriptors.length > 0 ? env.mergeSecurityDescriptors(...argDescriptors) : undefined;
  const inputTaint = checkRunInputLabelFlow({
    descriptor: inputDescriptor,
    policyEnforcer,
    policyChecksEnabled,
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

  const usingParts = await resolveUsingEnvParts(tempEnv, (definition as any).withClause, withClause);
  const envAuthSecrets = await resolveEnvironmentAuthSecrets(tempEnv, resolvedEnvConfig);
  const envAuthDescriptor = buildAuthDescriptor(resolvedEnvConfig?.auth);
  const envInputDescriptor = mergeInputDescriptors(usingParts.descriptor, envAuthDescriptor);
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
        workingDirectory
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
    workingDirectory
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
    argValues,
    callStack,
    services
  } = ctx;

  const refAst = (definition as any).commandRefAst;
  if (refAst) {
    const { evaluateExecInvocation } = await import('@interpreter/eval/exec-invocation');
    const execEnv = env.createChild();
    for (const [key, value] of Object.entries(argValues)) {
      execEnv.setParameterVariable(key, createSimpleTextVariable(key, value));
    }
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
      identifier: [{ type: 'Text', content: refCommand }],
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
    exeLabels,
    callStack,
    services
  } = ctx;

  const outputDescriptors: SecurityDescriptor[] = [];
  const tempEnv = env.createChild();
  for (const [key, value] of Object.entries(argValues)) {
    tempEnv.setParameterVariable(key, createSimpleTextVariable(key, value));
  }
  const workingDirectory = await resolveWorkingDirectory(
    (definition as any)?.workingDir,
    tempEnv,
    { sourceLocation: directive.location, directiveType: 'run' }
  );

  const codeParams = { ...argRuntimeValues } as Record<string, unknown>;
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
      directive.location ?? undefined
    );
  }
  const inputDescriptor =
    argDescriptors.length > 0 ? env.mergeSecurityDescriptors(...argDescriptors) : undefined;
  const inputTaint = checkRunInputLabelFlow({
    descriptor: inputDescriptor,
    policyEnforcer,
    policyChecksEnabled: policyChecksEnabled && Boolean(opType),
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
    logger.debug('🎯 mlld-when handler in run.ts CALLED');
    const whenExprNode = (definition as any).codeTemplate[0];
    if (!whenExprNode || whenExprNode.type !== 'WhenExpression') {
      throw new Error('mlld-when executable missing WhenExpression node');
    }

    const execEnv = env.createChild();
    for (const [key, value] of Object.entries(codeParams)) {
      bindRunParameterVariable(execEnv, key, value, argValues[key] ?? '');
    }

    const { evaluateWhenExpression } = await import('@interpreter/eval/when-expression');
    const whenResult = await evaluateWhenExpression(whenExprNode, execEnv);
    const normalized = normalizeWhenShowEffect(whenResult.value);

    logger.debug('🎯 mlld-when result:', {
      outputType: typeof normalized.normalized,
      outputValue: String(normalized.normalized ?? '').substring(0, 100)
    });

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
    for (const [key, value] of Object.entries(codeParams)) {
      bindRunParameterVariable(execEnv, key, value, argValues[key] ?? '');
    }

    const { evaluateExeBlock } = await import('@interpreter/eval/exe');
    const blockResult = await evaluateExeBlock(blockNode, execEnv);
    return {
      value: blockResult.value,
      outputDescriptors,
      callStack
    };
  }

  const code = await services.interpolateWithPendingDescriptor(
    (definition as any).codeTemplate,
    InterpolationContext.ShellCommand,
    tempEnv
  );
  if (process.env.DEBUG_EXEC) {
    logger.debug('run.ts code execution debug:', {
      codeTemplate: (definition as any).codeTemplate,
      interpolatedCode: code,
      argValues
    });
  }

  const value = await AutoUnwrapManager.executeWithPreservation(async () => {
    return env.executeCode(
      code,
      (definition as any).language || 'javascript',
      codeParams,
      undefined,
      workingDirectory ? { workingDirectory } : undefined,
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
  const { env, definition, argValues, argRuntimeValues, callStack, services } = ctx;
  const tempEnv = createTemplateInterpolationEnv(env.createChild(), definition);
  for (const [key, stringValue] of Object.entries(argValues)) {
    bindRunParameterVariable(tempEnv, key, argRuntimeValues[key], stringValue);
  }

  const templateOutput = await services.interpolateWithPendingDescriptor(
    (definition as any).template,
    InterpolationContext.Default,
    tempEnv
  );
  return {
    value: templateOutput,
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

  if (definition.type === 'prose') {
    return handleProseDefinition(params);
  }

  throw new Error(`Unsupported executable type: ${definition.type}`);
}
