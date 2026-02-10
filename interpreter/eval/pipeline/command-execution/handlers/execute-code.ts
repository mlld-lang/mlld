import type { Environment } from '@interpreter/env/Environment';
import type { CommandExecutionContext } from '@interpreter/env/ErrorUtils';
import {
  isStructuredValue,
  normalizeWhenShowEffect
} from '@interpreter/utils/structured-value';
import {
  shouldAutoParsePipelineInput,
  wrapJsonLikeString
} from '@interpreter/eval/pipeline/command-execution/structured-input';

export type FinalizeResult = (
  value: unknown,
  options?: { type?: string; text?: string }
) => unknown;

export interface ExecuteCodeHandlerOptions {
  env: Environment;
  execEnv: Environment;
  execDef: any;
  stdinInput?: string;
  workingDirectory?: string;
  executionContext?: CommandExecutionContext;
  pipelineCtx?: unknown;
  format?: string;
  stageLanguage?: string;
  finalizeResult: FinalizeResult;
}

function toStableText(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function executeCodeHandler(
  options: ExecuteCodeHandlerOptions
): Promise<unknown> {
  const {
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
  } = options;

  if (execDef.language === 'mlld-when') {
    const whenExprNode = execDef.codeTemplate[0];
    if (!whenExprNode || whenExprNode.type !== 'WhenExpression') {
      throw new Error('mlld-when executable missing WhenExpression node');
    }

    const { evaluateWhenExpression } = await import('@interpreter/eval/when-expression');
    const whenResult = await evaluateWhenExpression(whenExprNode, execEnv);

    let resultValue = whenResult.value;
    if (resultValue && typeof resultValue === 'object' && resultValue.value === 'retry') {
      return resultValue;
    }
    if (resultValue === 'retry') {
      return 'retry';
    }

    const normalized = normalizeWhenShowEffect(resultValue);
    resultValue = normalized.normalized;

    const inPipeline = !!env.getPipelineContext();
    if (inPipeline && normalized.hadShowEffect) {
      const pmx = env.getPipelineContext?.();
      const isLastStage = pmx && typeof pmx.stage === 'number' && typeof pmx.totalStages === 'number'
        ? pmx.stage >= pmx.totalStages
        : false;
      return finalizeResult(isLastStage ? '' : (stdinInput || ''));
    }

    if (
      resultValue &&
      typeof resultValue === 'object' &&
      'wrapperType' in resultValue &&
      Array.isArray(resultValue.content)
    ) {
      const { interpolate } = await import('@interpreter/core/interpreter');
      try {
        resultValue = await interpolate(resultValue.content, execEnv);
      } catch {
        resultValue = String(resultValue);
      }
    }

    return finalizeResult(resultValue ?? '');
  }

  if (execDef.language === 'mlld-foreach') {
    const foreachNode = execDef.codeTemplate[0];
    const { evaluateForeachCommand } = await import('@interpreter/eval/foreach');
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
    return finalizeResult(normalized, { type: 'array', text: toStableText(normalized) });
  }

  if (execDef.language === 'mlld-for') {
    const forNode = execDef.codeTemplate[0];
    const { evaluateForExpression } = await import('@interpreter/eval/for');
    const arrayVar = await evaluateForExpression(forNode, execEnv);
    const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
    const value = await extractVariableValue(arrayVar, execEnv);
    return finalizeResult(value, { type: 'array', text: toStableText(value) });
  }

  if (execDef.language === 'mlld-loop') {
    const loopNode = execDef.codeTemplate[0];
    if (!loopNode || loopNode.type !== 'LoopExpression') {
      throw new Error('mlld-loop executable missing LoopExpression node');
    }
    const { evaluateLoopExpression } = await import('@interpreter/eval/loop');
    const value = await evaluateLoopExpression(loopNode, execEnv);
    const type = Array.isArray(value) ? 'array' : typeof value === 'object' && value !== null ? 'object' : 'text';
    return finalizeResult(value, { type, text: toStableText(value) });
  }

  const { interpolate } = await import('@interpreter/core/interpreter');
  const { InterpolationContext } = await import('@interpreter/core/interpolation-context');
  const code = await interpolate(execDef.codeTemplate, execEnv, InterpolationContext.Default);

  const params: Record<string, any> = {};
  if (execDef.paramNames) {
    for (const paramName of execDef.paramNames) {
      const paramVar = execEnv.getVariable(paramName);
      if (!paramVar) {
        continue;
      }
      if (paramVar.type === 'pipeline-input') {
        params[paramName] = paramVar.value;
        continue;
      }
      if (paramVar.internal?.isPipelineInput && paramVar.internal?.pipelineInput) {
        params[paramName] = paramVar.internal?.pipelineInput;
        continue;
      }
      params[paramName] = paramVar.value;
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

  if (result && typeof result === 'object' && 'text' in result && 'type' in result) {
    const text =
      typeof (result as any).text === 'string'
        ? (result as any).text
        : String((result as any).text ?? '');
    const type =
      typeof (result as any).type === 'string' ? (result as any).type : undefined;
    return finalizeResult(result, { type, text });
  }

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
}
