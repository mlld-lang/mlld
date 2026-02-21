import type { ExecInvocation } from '@core/types';
import { MlldInterpreterError } from '@core/errors';
import { logger } from '@core/utils/logger';
import type { CodeExecutable } from '@core/types/executable';
import type { SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import type { WhenExpressionNode } from '@core/types/when';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { OperationContext } from '@interpreter/env/ContextManager';
import { prepareValueForShadow } from '@interpreter/env/variable-proxy';
import { evaluateExeBlock } from '@interpreter/eval/exe';
import { AutoUnwrapManager } from '@interpreter/eval/auto-unwrap-manager';
import { applyWithClause } from '@interpreter/eval/with-clause';
import { handleExecGuardDenial } from '@interpreter/eval/guard-denial-handler';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';
import type { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { resolveUsingEnvParts } from '@interpreter/utils/auth-injection';
import {
  asText,
  isStructuredValue,
  normalizeWhenShowEffect,
  wrapStructured
} from '@interpreter/utils/structured-value';
import { getSecurityDescriptorFromCarrier } from '@interpreter/eval/exec/security-descriptor';

export type CodeExecutableHandlerServices = {
  interpolateWithResultDescriptor: (nodes: any, targetEnv?: Environment) => Promise<string>;
  toPipelineInput: (value: unknown, options?: { type?: string; text?: string }) => unknown;
  mergeResultDescriptor: (descriptor?: SecurityDescriptor) => void;
  getResultSecurityDescriptor: () => SecurityDescriptor | undefined;
  finalizeResult: (result: EvalResult) => Promise<EvalResult>;
};

export type CodeExecutableHandlerOptions = {
  definition: CodeExecutable;
  commandName: string;
  node: ExecInvocation;
  env: Environment;
  execEnv: Environment;
  variable: Variable;
  params: string[];
  evaluatedArgs: unknown[];
  evaluatedArgStrings: string[];
  exeLabels: readonly string[];
  policyEnforcer: PolicyEnforcer;
  operationContext: OperationContext;
  mergePolicyInputDescriptor: (descriptor?: SecurityDescriptor) => SecurityDescriptor | undefined;
  workingDirectory?: string;
  whenExprNode?: WhenExpressionNode | null;
  services: CodeExecutableHandlerServices;
};

export type CodeExecutableHandlerResult =
  | {
      kind: 'continue';
      result: unknown;
      execEnv: Environment;
    }
  | {
      kind: 'return';
      evalResult: EvalResult;
    };

export async function executeCodeExecutable(
  options: CodeExecutableHandlerOptions
): Promise<CodeExecutableHandlerResult> {
  const {
    definition,
    commandName,
    node,
    env,
    variable,
    params,
    evaluatedArgs,
    evaluatedArgStrings,
    exeLabels,
    policyEnforcer,
    operationContext,
    mergePolicyInputDescriptor,
    workingDirectory,
    whenExprNode,
    services
  } = options;

  let execEnv = options.execEnv;
  let result: unknown;

  if (definition.language === 'mlld-when') {
    const activeWhenExpr = whenExprNode;
    if (!activeWhenExpr) {
      throw new MlldInterpreterError('mlld-when executable missing WhenExpression node');
    }

    const { evaluateWhenExpression } = await import('@interpreter/eval/when-expression');
    let whenResult: EvalResult;
    try {
      whenResult = await evaluateWhenExpression(activeWhenExpr, execEnv);
    } catch (error) {
      const handled = await handleExecGuardDenial(error, {
        execEnv,
        env,
        whenExprNode: activeWhenExpr
      });
      if (handled) {
        return {
          kind: 'return',
          evalResult: await services.finalizeResult(handled)
        };
      }
      throw error;
    }

    const normalization = normalizeWhenShowEffect(whenResult.value);
    result = normalization.normalized;
    execEnv = whenResult.env;
  } else if (definition.language === 'mlld-foreach') {
    const foreachNode = definition.codeTemplate[0];
    const { evaluateForeachCommand } = await import('@interpreter/eval/foreach');
    result = await evaluateForeachCommand(foreachNode, execEnv);
  } else if (definition.language === 'mlld-for') {
    const forExprNode = definition.codeTemplate[0];
    if (!forExprNode || forExprNode.type !== 'ForExpression') {
      throw new MlldInterpreterError('mlld-for executable missing ForExpression node');
    }
    const { evaluateForExpression } = await import('@interpreter/eval/for');
    result = await evaluateForExpression(forExprNode, execEnv);
  } else if (definition.language === 'mlld-loop') {
    const loopExprNode = definition.codeTemplate[0];
    if (!loopExprNode || loopExprNode.type !== 'LoopExpression') {
      throw new MlldInterpreterError('mlld-loop executable missing LoopExpression node');
    }
    const { evaluateLoopExpression } = await import('@interpreter/eval/loop');
    result = await evaluateLoopExpression(loopExprNode, execEnv);
  } else if (definition.language === 'mlld-exe-block') {
    const blockNode = Array.isArray(definition.codeTemplate)
      ? (definition.codeTemplate[0] as any)
      : undefined;
    if (!blockNode || !blockNode.values) {
      throw new MlldInterpreterError('mlld-exe-block executable missing block content');
    }

    const blockResult = await evaluateExeBlock(blockNode, execEnv);
    result = blockResult.value;
    execEnv = blockResult.env;
  } else if (definition.language === 'mlld-env') {
    const envDirectiveNode = Array.isArray(definition.codeTemplate)
      ? (definition.codeTemplate[0] as any)
      : undefined;
    if (!envDirectiveNode || envDirectiveNode.type !== 'Directive' || envDirectiveNode.kind !== 'env') {
      throw new MlldInterpreterError('mlld-env executable missing env directive');
    }

    const { evaluateEnv } = await import('@interpreter/eval/env');
    const envResult = await evaluateEnv(envDirectiveNode, execEnv);
    result = envResult.value;
    execEnv = envResult.env;
  } else {
    let code: string;
    if (definition.language === 'bash' || definition.language === 'sh') {
      if (Array.isArray(definition.codeTemplate)) {
        code = definition.codeTemplate
          .map(node => {
            if (typeof node === 'string') {
              return node;
            }
            if (node && typeof node === 'object' && 'content' in node) {
              return node.content || '';
            }
            return '';
          })
          .join('');
      } else if (typeof definition.codeTemplate === 'string') {
        code = definition.codeTemplate;
      } else {
        code = '';
      }
    } else {
      code = await services.interpolateWithResultDescriptor(definition.codeTemplate, execEnv);
    }

    const { ASTEvaluator } = await import('@interpreter/core/ast-evaluator');

    const codeParams: Record<string, any> = {};
    const variableMetadata: Record<string, any> = {};

    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const paramVar = execEnv.getVariable(paramName);

      if (paramVar && paramVar.type === 'pipeline-input') {
        codeParams[paramName] = paramVar.value;
      } else if (paramVar) {
        if (definition.language === 'bash' || definition.language === 'sh') {
          const rawValue = paramVar.value;
          if (typeof rawValue === 'string') {
            codeParams[paramName] = rawValue;
          } else if (isStructuredValue(rawValue)) {
            codeParams[paramName] = asText(rawValue);
          } else {
            codeParams[paramName] = prepareValueForShadow(paramVar);
          }
        } else if (env.shouldSuppressGuards() && paramVar.internal?.isSystem && paramVar.internal?.isParameter) {
          const rawValue = isStructuredValue(paramVar.value)
            ? paramVar.value.data
            : paramVar.value;
          codeParams[paramName] = rawValue;
        } else {
          let variableForShadow: Variable = paramVar;
          if (
            (paramVar as any).isComplex &&
            paramVar.value &&
            typeof paramVar.value === 'object' &&
            'type' in paramVar.value
          ) {
            const { extractVariableValue: extractVal } = await import('@interpreter/utils/variable-resolution');
            const resolvedValue = await extractVal(paramVar, execEnv);
            variableForShadow = {
              ...paramVar,
              value: resolvedValue,
              isComplex: false
            };
          } else {
            const unwrappedValue = AutoUnwrapManager.unwrap(paramVar.value);
            if (unwrappedValue !== paramVar.value) {
              variableForShadow = {
                ...paramVar,
                value: unwrappedValue,
                type: Array.isArray(unwrappedValue) ? 'array' : 'text'
              } as Variable;
            }
          }

          codeParams[paramName] = variableForShadow;
        }

        if (
          definition.language !== 'bash' &&
          definition.language !== 'sh' &&
          (paramVar.value === null || typeof paramVar.value !== 'object')
        ) {
          const subtype =
            paramVar.type === 'primitive' && 'primitiveType' in paramVar
              ? (paramVar as any).primitiveType
              : paramVar.subtype;

          variableMetadata[paramName] = {
            type: paramVar.type,
            subtype,
            mx: paramVar.mx,
            internal: paramVar.internal,
            isVariable: true
          };
        }
      } else {
        const argValue = evaluatedArgs[i];
        codeParams[paramName] = await ASTEvaluator.evaluateToRuntime(argValue, execEnv);
      }
    }

    const capturedModuleEnv = variable.internal?.capturedModuleEnv as Map<string, Variable> | undefined;
    if (capturedModuleEnv instanceof Map && isShadowLanguage(definition.language)) {
      for (const [capturedName, capturedVar] of capturedModuleEnv) {
        if (codeParams[capturedName] !== undefined) {
          continue;
        }
        if (params.includes(capturedName)) {
          continue;
        }
        if (capturedVar.type === 'executable') {
          continue;
        }

        codeParams[capturedName] = capturedVar;

        if (capturedVar.value === null || typeof capturedVar.value !== 'object') {
          const subtype =
            capturedVar.type === 'primitive' && 'primitiveType' in capturedVar
              ? (capturedVar as any).primitiveType
              : (capturedVar as any).subtype;
          variableMetadata[capturedName] = {
            type: capturedVar.type,
            subtype,
            mx: capturedVar.mx,
            isVariable: true
          };
        }
      }
    }

    const capturedEnvs = variable.internal?.capturedShadowEnvs;
    if (capturedEnvs && isShadowLanguage(definition.language)) {
      (codeParams as any).__capturedShadowEnvs = capturedEnvs;
    }

    const usingParts = await resolveUsingEnvParts(execEnv, definition.withClause, node.withClause);
    const envInputTaint = descriptorToInputTaint(mergePolicyInputDescriptor(usingParts.descriptor));
    if (envInputTaint.length > 0) {
      policyEnforcer.checkLabelFlow(
        {
          inputTaint: envInputTaint,
          opLabels: operationContext.opLabels ?? [],
          exeLabels,
          flowChannel: 'using'
        },
        { env, sourceLocation: node.location }
      );
    }

    const injectedEnv = usingParts.merged;
    const codeOptions =
      workingDirectory || Object.keys(injectedEnv).length > 0
        ? {
            ...(workingDirectory ? { workingDirectory } : {}),
            ...(Object.keys(injectedEnv).length > 0 ? { env: injectedEnv } : {})
          }
        : undefined;

    const codeResult = await execEnv.executeCode(
      code,
      definition.language || 'javascript',
      codeParams,
      Object.keys(variableMetadata).length > 0 ? variableMetadata : undefined,
      codeOptions,
      workingDirectory
        ? { directiveType: 'exec', sourceLocation: node.location, workingDirectory }
        : { directiveType: 'exec', sourceLocation: node.location }
    );

    let processedResult: any;
    if (
      typeof codeResult === 'string' &&
      (codeResult.startsWith('"') ||
        codeResult.startsWith('{') ||
        codeResult.startsWith('[') ||
        codeResult === 'null' ||
        codeResult === 'true' ||
        codeResult === 'false' ||
        /^-?\d+(\.\d+)?$/.test(codeResult))
    ) {
      try {
        processedResult = JSON.parse(codeResult);
      } catch {
        processedResult = codeResult;
      }
    } else {
      processedResult = codeResult;
    }

    result = AutoUnwrapManager.restore(processedResult);

    if (
      result &&
      typeof result === 'object' &&
      !isStructuredValue(result) &&
      'type' in result &&
      'text' in result &&
      'data' in result
    ) {
      const payload = (result as any).data;
      result = wrapStructured(payload, (result as any).type, (result as any).text, (result as any).metadata);
    }

    if (definition.withClause) {
      if (definition.withClause.pipeline && definition.withClause.pipeline.length > 0) {
        const { processPipeline } = await import('@interpreter/eval/pipeline/unified-processor');
        const pipelineInput = services.toPipelineInput(result);
        result = await processPipeline({
          value: pipelineInput,
          env: execEnv,
          pipeline: definition.withClause.pipeline,
          format: definition.withClause.format as string | undefined,
          isRetryable: false,
          identifier: commandName,
          location: node.location,
          descriptorHint: services.getResultSecurityDescriptor()
        });
      } else {
        const withClauseResult = await applyWithClause(result, definition.withClause, execEnv);
        result = withClauseResult.value ?? withClauseResult;
      }
    }

    const inputDescriptors = Object.values(variableMetadata)
      .map(meta => getSecurityDescriptorFromCarrier(meta))
      .filter((descriptor): descriptor is SecurityDescriptor => Boolean(descriptor));

    if (inputDescriptors.length > 0) {
      const mergedInputDescriptor =
        inputDescriptors.length === 1
          ? inputDescriptors[0]
          : env.mergeSecurityDescriptors(...inputDescriptors);
      env.recordSecurityDescriptor(mergedInputDescriptor);
      services.mergeResultDescriptor(mergedInputDescriptor);
    }
  }

  return {
    kind: 'continue',
    result,
    execEnv
  };
}

function isShadowLanguage(language: string): boolean {
  return language === 'js' || language === 'javascript' || language === 'node' || language === 'nodejs';
}
