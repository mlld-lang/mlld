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
  isSectionExecutable,
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
import { readFileWithPolicy } from '@interpreter/policy/filesystem-policy';
import {
  applySecurityDescriptorToStructuredValue,
  extractSecurityDescriptor,
  isStructuredValue,
  parseAndWrapJson,
  wrapStructured
} from '@interpreter/utils/structured-value';
import { wrapExecResult } from '@interpreter/utils/structured-exec';
import { extractSection } from '@interpreter/eval/show';
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
  resultSecurityDescriptor?: SecurityDescriptor;
  services: NonCommandExecutableHandlerServices;
};

type NonCommandHandlerKey =
  | 'nodeFunctionOrClass'
  | 'template'
  | 'data'
  | 'pipeline'
  | 'commandRef'
  | 'section'
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
    key: 'section',
    matches: definition => isSectionExecutable(definition)
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
    section: handleSectionExecutable,
    resolver: handleResolverExecutable
  };
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

  const jsArgs = evaluatedArgs.map(arg => toJsValue(arg));
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
    services
  } = options;
  const templateResult = await services.interpolateWithResultDescriptor(definition.template, execEnv);
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
      descriptorHint: resultSecurityDescriptor
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
  const { definition, commandName, node, execEnv, evaluatedArgs, resultSecurityDescriptor, services } = options;
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
    descriptorHint: resultSecurityDescriptor
  });
  return typeof pipelineResult === 'string' ? pipelineResult : String(pipelineResult ?? '');
}

async function handleCommandRefExecutable(
  options: NonCommandExecutableHandlerOptions
): Promise<unknown> {
  const { definition, commandName, node, env, execEnv, variable, params, evaluatedArgs, services } = options;
  const refAst = (definition as any).commandRefAst;
  if (refAst) {
    const refWithClause = mergeAuthUsingIntoWithClause((definition as any).withClause, node.withClause);
    const refEnv = env.createChild();
    if (variable?.internal?.capturedModuleEnv instanceof Map) {
      refEnv.setCapturedModuleEnv(variable.internal.capturedModuleEnv);
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
  if (variable?.internal?.capturedModuleEnv) {
    const capturedEnv = variable.internal.capturedModuleEnv as Map<string, Variable> | Record<string, Variable> | undefined;
    if (capturedEnv instanceof Map) {
      refCommand = capturedEnv.get(refName) ?? null;
    } else if (capturedEnv && typeof capturedEnv === 'object') {
      refCommand = capturedEnv[refName] ?? null;
    }
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
    if (variable?.internal?.capturedModuleEnv instanceof Map) {
      refEnv.setCapturedModuleEnv(variable.internal.capturedModuleEnv);
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
  if (variable?.internal?.capturedModuleEnv instanceof Map) {
    refEnv.setCapturedModuleEnv(variable.internal.capturedModuleEnv);
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

async function handleSectionExecutable(
  options: NonCommandExecutableHandlerOptions
): Promise<unknown> {
  const { definition, nodeSourceLocation, execEnv, env, services } = options;
  const filePath = await services.interpolateWithResultDescriptor((definition as any).pathTemplate, execEnv);
  const sectionName = await services.interpolateWithResultDescriptor((definition as any).sectionTemplate, execEnv);
  const fileContent = await readFileWithPolicy(execEnv, filePath, nodeSourceLocation ?? undefined);

  const llmxmlInstance = env.getLlmxml();
  let sectionContent: string;
  try {
    const titleWithoutHash = sectionName.replace(/^#+\s*/, '');
    sectionContent = await llmxmlInstance.getSection(fileContent, titleWithoutHash, {
      includeNested: true
    });
  } catch {
    sectionContent = extractSection(fileContent, sectionName);
  }

  if ((definition as any).renameTemplate) {
    const newTitle = await services.interpolateWithResultDescriptor((definition as any).renameTemplate, execEnv);
    const lines = sectionContent.split('\n');
    if (lines.length > 0 && lines[0].match(/^#+\s/)) {
      const newTitleTrimmed = newTitle.trim();
      const newHeadingMatch = newTitleTrimmed.match(/^(#+)(\s+(.*))?$/);

      if (newHeadingMatch) {
        if (!newHeadingMatch[3]) {
          const originalText = lines[0].replace(/^#+\s*/, '');
          lines[0] = `${newHeadingMatch[1]} ${originalText}`;
        } else {
          lines[0] = newTitleTrimmed;
        }
      } else {
        const originalLevel = lines[0].match(/^#+/)?.[0] || '#';
        lines[0] = `${originalLevel} ${newTitleTrimmed}`;
      }

      sectionContent = lines.join('\n');
    }
  }

  return sectionContent;
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
