import type { ExecInvocation } from '@core/types';
import type { SourceLocation } from '@core/types';
import type { ExecutableDefinition } from '@core/types/executable';
import {
  isCommandRefExecutable,
  isDataExecutable,
  isNodeClassExecutable,
  isNodeFunctionExecutable,
  isPipelineExecutable,
  isResolverExecutable,
  isTemplateExecutable
} from '@core/types/executable';
import type { SecurityDescriptor } from '@core/types/security';
import type { Variable, VariableContext } from '@core/types/variable';
import { MlldInterpreterError } from '@core/errors';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import { mergeAuthUsingIntoWithClause } from '@interpreter/eval/exec/context';
import { createTemplateInterpolationEnv } from '@interpreter/eval/exec/template-interpolation-env';
import {
  applySecurityDescriptorToStructuredValue,
  extractSecurityDescriptor,
  isStructuredValue,
  parseAndWrapJson,
  wrapStructured
} from '@interpreter/utils/structured-value';
import { wrapExecResult } from '@interpreter/utils/structured-exec';
import { isEventEmitter, isLegacyStream, toJsValue, wrapNodeValue } from '@interpreter/utils/node-interop';

export type NonCommandExecutableHandlerServices = {
  interpolateWithResultDescriptor: (
    nodes: any,
    targetEnv?: Environment,
    interpolationContext?: InterpolationContext
  ) => Promise<string>;
  toPipelineInput: (value: unknown, options?: { type?: string; text?: string }) => unknown;
  // Recursion seam for command-ref invocations.
  evaluateExecInvocation: (node: ExecInvocation, env: Environment) => Promise<EvalResult>;
};

export type NonCommandExecutableHandlerOptions = {
  definition: ExecutableDefinition;
  commandName: string;
  node: ExecInvocation;
  nodeSourceLocation: SourceLocation | undefined;
  env: Environment;
  execEnv: Environment;
  variable: Variable;
  params: string[];
  evaluatedArgs: unknown[];
  argSourceNames?: (string | undefined)[];
  resultSecurityDescriptor?: SecurityDescriptor;
  exeLabels?: readonly string[];
  services: NonCommandExecutableHandlerServices;
};

type NonCommandHandlerKey =
  | 'nodeFunctionOrClass'
  | 'template'
  | 'data'
  | 'pipeline'
  | 'commandRef'
  | 'resolver';

type NonCommandHandler = (options: NonCommandExecutableHandlerOptions) => Promise<unknown>;

const NON_COMMAND_HANDLER_MATCHERS: ReadonlyArray<{
  key: NonCommandHandlerKey;
  matches: (definition: ExecutableDefinition) => boolean;
}> = [
  {
    key: 'nodeFunctionOrClass',
    matches: definition => isNodeFunctionExecutable(definition) || isNodeClassExecutable(definition)
  },
  {
    key: 'template',
    matches: definition => isTemplateExecutable(definition)
  },
  {
    key: 'data',
    matches: definition => isDataExecutable(definition)
  },
  {
    key: 'pipeline',
    matches: definition => isPipelineExecutable(definition)
  },
  {
    key: 'commandRef',
    matches: definition => isCommandRefExecutable(definition)
  },
  {
    key: 'resolver',
    matches: definition => isResolverExecutable(definition)
  }
];

export async function executeNonCommandExecutable(
  options: NonCommandExecutableHandlerOptions
): Promise<unknown | undefined> {
  const route = NON_COMMAND_HANDLER_MATCHERS.find(entry => entry.matches(options.definition));
  if (!route) {
    return undefined;
  }
  const handler = createNonCommandHandlerMap()[route.key];
  return handler(options);
}

function createNonCommandHandlerMap(): Record<NonCommandHandlerKey, NonCommandHandler> {
  return {
    nodeFunctionOrClass: handleNodeFunctionOrClassExecutable,
    template: handleTemplateExecutable,
    data: handleDataExecutable,
    pipeline: handlePipelineExecutable,
    commandRef: handleCommandRefExecutable,
    resolver: handleResolverExecutable
  };
}

async function getCapturedModuleEnvMap(
  variableLike: { internal?: Record<string, unknown> } | undefined
): Promise<Map<string, Variable> | undefined> {
  const rawCaptured = variableLike?.internal?.capturedModuleEnv;
  if (!rawCaptured) {
    return undefined;
  }
  if (rawCaptured instanceof Map) {
    return rawCaptured as Map<string, Variable>;
  }
  if (typeof rawCaptured !== 'object') {
    return undefined;
  }

  const { VariableImporter } = await import('@interpreter/eval/import/VariableImporter');
  const { ObjectReferenceResolver } = await import('@interpreter/eval/import/ObjectReferenceResolver');
  const importer = new VariableImporter(new ObjectReferenceResolver());
  const moduleEnvMap = importer.deserializeModuleEnv(rawCaptured);

  for (const [, capturedVar] of moduleEnvMap) {
    if (capturedVar.type === 'executable') {
      capturedVar.internal = {
        ...(capturedVar.internal ?? {}),
        capturedModuleEnv: moduleEnvMap
      };
    }
  }

  if (variableLike?.internal) {
    variableLike.internal.capturedModuleEnv = moduleEnvMap;
  }

  return moduleEnvMap;
}

async function handleNodeFunctionOrClassExecutable(
  options: NonCommandExecutableHandlerOptions
): Promise<unknown> {
  const { definition, commandName, evaluatedArgs, resultSecurityDescriptor, nodeSourceLocation } = options;

  if (isNodeClassExecutable(definition)) {
    throw new MlldInterpreterError(
      `Node class '${commandName}' requires new`,
      'exec',
      nodeSourceLocation
    );
  }

  if (!isNodeFunctionExecutable(definition)) {
    throw new MlldInterpreterError(`Unknown executable type: ${(definition as any).type}`);
  }

  // For MCP tools: if caller arg names match MCP param names, pass a named
  // object so buildMcpArgs matches by name instead of position.
  const isMcpTool = options.variable?.internal?.mcpTool != null;
  const { params, argSourceNames } = options;
  let jsArgs: unknown[];
  if (isMcpTool && argSourceNames && argSourceNames.length > 0) {
    const mcpParamSet = new Set(params);
    const hasNameMatch = argSourceNames.some(n => n != null && mcpParamSet.has(n));
    if (hasNameMatch) {
      const named: Record<string, unknown> = {};
      for (let i = 0; i < evaluatedArgs.length; i++) {
        const argName = argSourceNames[i];
        const key = argName && mcpParamSet.has(argName) ? argName : params[i];
        if (key) {
          named[key] = toJsValue(evaluatedArgs[i]);
        }
      }
      jsArgs = [named];
    } else {
      jsArgs = evaluatedArgs.map(arg => toJsValue(arg));
    }
  } else {
    jsArgs = evaluatedArgs.map(arg => toJsValue(arg));
  }
  let output = definition.fn.apply(definition.thisArg ?? undefined, jsArgs);
  if (output && typeof output === 'object' && typeof (output as any).then === 'function') {
    output = await output;
  }

  if (isEventEmitter(output) && !(output && typeof (output as any).then === 'function')) {
    throw new MlldInterpreterError(
      `Node function '${commandName}' returns an EventEmitter and requires subscriptions`,
      'exec',
      nodeSourceLocation
    );
  }
  if (isLegacyStream(output)) {
    throw new MlldInterpreterError(
      `Node function '${commandName}' returns a legacy stream without async iterator support`,
      'exec',
      nodeSourceLocation
    );
  }

  const wrapped = wrapNodeValue(output, { moduleName: definition.moduleName });
  if (isStructuredValue(wrapped) && resultSecurityDescriptor) {
    applySecurityDescriptorToStructuredValue(wrapped, resultSecurityDescriptor);
  }
  return wrapped;
}

async function handleTemplateExecutable(
  options: NonCommandExecutableHandlerOptions
): Promise<unknown> {
  const {
    definition,
    commandName,
    node,
    execEnv,
    resultSecurityDescriptor,
    exeLabels,
    services
  } = options;
  const templateInterpolationEnv = createTemplateInterpolationEnv(execEnv, definition);
  const templateResult = await services.interpolateWithResultDescriptor(
    definition.template,
    templateInterpolationEnv
  );
  let result: unknown;
  if (isStructuredValue(templateResult)) {
    result = templateResult;
  } else if (typeof templateResult === 'string') {
    const parsed = parseAndWrapJson(templateResult, {
      metadata: resultSecurityDescriptor ? { security: resultSecurityDescriptor } : undefined,
      preserveText: true
    });
    result = parsed ?? templateResult;
  } else {
    result = templateResult;
  }

  if (!isStructuredValue(result) && result && typeof result === 'object') {
    const templateType = Array.isArray(result) ? 'array' : 'object';
    const metadata = resultSecurityDescriptor ? { security: resultSecurityDescriptor } : undefined;
    result = wrapStructured(result as Record<string, unknown>, templateType, undefined, metadata);
  }

  const templateWithClause = (definition as any).withClause;
  if (!templateWithClause) {
    return result;
  }

  if (templateWithClause.pipeline && templateWithClause.pipeline.length > 0) {
    const { processPipeline } = await import('@interpreter/eval/pipeline/unified-processor');
    return processPipeline({
      value: services.toPipelineInput(result),
      env: execEnv,
      pipeline: templateWithClause.pipeline,
      format: templateWithClause.format as string | undefined,
      isRetryable: false,
      identifier: commandName,
      location: node.location,
      descriptorHint: resultSecurityDescriptor,
      exeLabels
    });
  }

  const { applyWithClause } = await import('@interpreter/eval/with-clause');
  const withClauseResult = await applyWithClause(result, templateWithClause, execEnv);
  return withClauseResult.value ?? withClauseResult;
}

async function handleDataExecutable(
  options: NonCommandExecutableHandlerOptions
): Promise<unknown> {
  const { definition, execEnv, resultSecurityDescriptor } = options;
  const { evaluateDataValue } = await import('@interpreter/eval/data-value-evaluator');
  const dataValue = await evaluateDataValue((definition as any).dataTemplate, execEnv);
  const text = typeof dataValue === 'string' ? dataValue : JSON.stringify(dataValue);
  const dataDescriptor = extractSecurityDescriptor(dataValue, {
    recursive: true,
    mergeArrayElements: true
  });
  const mergedDescriptor =
    dataDescriptor && resultSecurityDescriptor
      ? execEnv.mergeSecurityDescriptors(dataDescriptor, resultSecurityDescriptor)
      : dataDescriptor || resultSecurityDescriptor || undefined;
  return wrapStructured(
    dataValue as any,
    Array.isArray(dataValue) ? 'array' : 'object',
    text,
    mergedDescriptor ? { security: mergedDescriptor } : undefined
  );
}

async function handlePipelineExecutable(
  options: NonCommandExecutableHandlerOptions
): Promise<unknown> {
  const { definition, commandName, node, execEnv, evaluatedArgs, resultSecurityDescriptor, exeLabels, services } = options;
  const { processPipeline } = await import('@interpreter/eval/pipeline/unified-processor');
  const pipelineInputValue =
    evaluatedArgs.length > 0
      ? services.toPipelineInput(evaluatedArgs[0])
      : '';
  const pipelineResult = await processPipeline({
    value: pipelineInputValue,
    env: execEnv,
    pipeline: (definition as any).pipeline,
    format: (definition as any).format,
    identifier: commandName,
    location: node.location,
    isRetryable: false,
    descriptorHint: resultSecurityDescriptor,
    exeLabels
  });
  return typeof pipelineResult === 'string' ? pipelineResult : String(pipelineResult ?? '');
}

async function handleCommandRefExecutable(
  options: NonCommandExecutableHandlerOptions
): Promise<unknown> {
  const { definition, commandName, node, env, execEnv, variable, params, evaluatedArgs, services } = options;
  const capturedModuleEnv = await getCapturedModuleEnvMap(variable as { internal?: Record<string, unknown> } | undefined);
  const refAst = (definition as any).commandRefAst;
  if (refAst) {
    const refWithClause = mergeAuthUsingIntoWithClause((definition as any).withClause, node.withClause);
    // Evaluate command-ref AST within invocation scope so executable parameters resolve.
    const refEnv = execEnv.createChild();
    if (capturedModuleEnv instanceof Map) {
      refEnv.setCapturedModuleEnv(capturedModuleEnv);
    }
    const baseInvocation =
      (refAst as any).type === 'ExecInvocation'
        ? (refAst as ExecInvocation)
        : ({
            type: 'ExecInvocation',
            commandRef: refAst
          } as ExecInvocation);
    const refInvocation = refWithClause ? { ...baseInvocation, withClause: refWithClause } : baseInvocation;
    const refResult = await services.evaluateExecInvocation(refInvocation, refEnv);
    return refResult.value as string;
  }

  const refName = (definition as any).commandRef;
  if (!refName) {
    throw new MlldInterpreterError(`Command reference ${commandName} has no target command`);
  }

  const refWithClause = mergeAuthUsingIntoWithClause((definition as any).withClause, node.withClause);

  let refCommand: Variable | null = null;
  if (capturedModuleEnv instanceof Map) {
    refCommand = capturedModuleEnv.get(refName) ?? null;
  }
  if (!refCommand) {
    refCommand = env.getVariable(refName) ?? null;
  }
  if (!refCommand) {
    throw new MlldInterpreterError(`Referenced command not found: ${refName}`);
  }

  if ((definition as any).commandArgs && (definition as any).commandArgs.length > 0) {
    if (process.env.MLLD_DEBUG === 'true') {
      try {
        console.error(
          '[EXEC INVOC] commandRef args shape:',
          ((definition as any).commandArgs as any[]).map((a: any) =>
            Array.isArray(a) ? 'array' : (a && typeof a === 'object' && a.type) || typeof a
          )
        );
      } catch {}
    }

    let refArgs: any[] = [];
    const { evaluate } = await import('@interpreter/core/interpreter');
    for (const argNode of (definition as any).commandArgs as any[]) {
      let value: any;
      if (Array.isArray(argNode)) {
        value = await services.interpolateWithResultDescriptor(
          argNode as any[],
          execEnv,
          InterpolationContext.Default
        );
      } else {
        const argResult = await evaluate(argNode as any, execEnv, { isExpression: true });
        value = argResult?.value;
      }
      if (typeof value === 'string') {
        const paramVar = execEnv.getVariable(value);
        if (paramVar?.internal?.isParameter) {
          value = isStructuredValue(paramVar.value) ? paramVar.value : paramVar.value;
        }
      }
      const argIdentifier =
        !Array.isArray(argNode) &&
        argNode &&
        typeof argNode === 'object' &&
        (argNode as any).type === 'VariableReference'
          ? ((argNode as any).identifier as string)
          : undefined;
      if (argIdentifier) {
        const sourceVar = execEnv.getVariable(argIdentifier);
        if (sourceVar?.internal?.isParameter) {
          const secDescriptor = sourceVar.mx ? varMxToSecurityDescriptor(sourceVar.mx as VariableContext) : undefined;
          if (secDescriptor && ((secDescriptor.labels?.length ?? 0) > 0 || (secDescriptor.taint?.length ?? 0) > 0)) {
            const structured = isStructuredValue(value) ? value : wrapExecResult(value);
            applySecurityDescriptorToStructuredValue(structured, secDescriptor);
            value = structured;
          }
        }
      }
      if (value !== undefined) {
        refArgs.push(value);
      }
    }

    const refEnv = env.createChild();
    if (capturedModuleEnv instanceof Map) {
      refEnv.setCapturedModuleEnv(capturedModuleEnv);
    }

    const refInvocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: refName,
        args: refArgs
      },
      ...(refWithClause ? { withClause: refWithClause } : {})
    };
    const refResult = await services.evaluateExecInvocation(refInvocation, refEnv);
    return refResult.value as string;
  }

  const refEnv = env.createChild();
  if (capturedModuleEnv instanceof Map) {
    refEnv.setCapturedModuleEnv(capturedModuleEnv);
  }
  const securedArgs = evaluatedArgs.map((arg: any, i: number) => {
    const paramName = params[i];
    if (!paramName) return arg;
    const paramVar = execEnv.getVariable(paramName);
    if (!paramVar?.internal?.isParameter) return arg;
    const secDescriptor = paramVar.mx ? varMxToSecurityDescriptor(paramVar.mx as VariableContext) : undefined;
    if (!secDescriptor || ((secDescriptor.labels?.length ?? 0) === 0 && (secDescriptor.taint?.length ?? 0) === 0)) {
      return arg;
    }
    const structured = isStructuredValue(arg) ? arg : wrapExecResult(arg);
    applySecurityDescriptorToStructuredValue(structured, secDescriptor);
    return structured;
  });
  const refInvocation: ExecInvocation = {
    type: 'ExecInvocation',
    commandRef: {
      identifier: refName,
      args: securedArgs
    },
    ...(refWithClause ? { withClause: refWithClause } : {})
  };

  const refResult = await services.evaluateExecInvocation(refInvocation, refEnv);
  return refResult.value as string;
}

async function handleResolverExecutable(
  options: NonCommandExecutableHandlerOptions
): Promise<unknown> {
  const { definition, params, evaluatedArgs, execEnv, env, services } = options;
  let resolverPath = (definition as any).resolverPath as string;
  for (let i = 0; i < params.length; i++) {
    const paramName = params[i];
    const argValue = evaluatedArgs[i];
    if (argValue !== undefined) {
      resolverPath = resolverPath.replace(new RegExp(`@${paramName}\\b`, 'g'), String(argValue));
    }
  }

  let payload: any = undefined;
  if ((definition as any).payloadTemplate) {
    const payloadStr = await services.interpolateWithResultDescriptor((definition as any).payloadTemplate, execEnv);
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      payload = payloadStr;
    }
  }

  const resolverManager = env.getResolverManager();
  if (!resolverManager) {
    throw new MlldInterpreterError('Resolver manager not available');
  }

  const resolverResult = await resolverManager.resolve(resolverPath, {
    context: 'exec-invocation',
    basePath: env.getBasePath(),
    payload
  });
  if (resolverResult && typeof resolverResult === 'object' && 'content' in resolverResult) {
    return (resolverResult as any).content;
  }
  if (typeof resolverResult === 'string') {
    return resolverResult;
  }
  if (resolverResult && typeof resolverResult === 'object') {
    return JSON.stringify(resolverResult, null, 2);
  }
  return String(resolverResult);
}
