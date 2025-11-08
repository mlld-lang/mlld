import type { ForDirective, ForExpression, Environment, ArrayVariable, Variable } from '@core/types';
import { evaluate, interpolate, type EvalResult } from '../core/interpreter';
import { InterpolationContext } from '../core/interpolation-context';
import { MlldDirectiveError } from '@core/errors';
import { toIterable } from './for-utils';
import { getParallelLimit, runWithConcurrency } from '@interpreter/utils/parallel';
import { RateLimitRetry, isRateLimitError } from '../eval/pipeline/rate-limit-retry';
import { createArrayVariable, createObjectVariable, createPrimitiveVariable, createSimpleTextVariable } from '@core/types/variable';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { VariableImporter } from './import/VariableImporter';
import { logger } from '@core/utils/logger';
import { DebugUtils } from '../env/DebugUtils';
import { isLoadContentResult, isLoadContentResultArray } from '@core/types/load-content';
import { asData, asText, isStructuredValue, looksLikeJsonString } from '../utils/structured-value';

// Helper to ensure a value is wrapped as a Variable
function ensureVariable(name: string, value: unknown, env: Environment): Variable {
  // If already a Variable, return as-is
  if (isVariable(value)) {
    return value;
  }
  
  // Special handling for LoadContentResult objects
  // These need to be preserved as objects with their special metadata
  if (isLoadContentResult(value) || isLoadContentResultArray(value)) {
    return createObjectVariable(
      name,
      value,
      false, // Not complex - it's already evaluated
      {
        directive: 'var',
        syntax: 'object',
        hasInterpolation: false,
        isMultiLine: false
      },
      {
        isLoadContentResult: true,
        arrayType: isLoadContentResultArray(value) ? 'load-content-result' : undefined,
        source: 'for-loop'
      }
    );
  }
  
  // Otherwise, create a Variable from the value
  const importer = new VariableImporter();
  return importer.createVariableFromValue(name, value, 'for-loop', undefined, { env });
}

export async function evaluateForDirective(
  directive: ForDirective,
  env: Environment
): Promise<EvalResult> {
  const varNode = directive.values.variable[0];
  const varName = varNode.identifier;
  
  // Debug support
  const debugEnabled = process.env.DEBUG_FOR === '1' || process.env.DEBUG_FOR === 'true' || process.env.MLLD_DEBUG === 'true';

  // Trace support
  env.pushDirective('/for', `@${varName} in ...`, directive.location);

  try {
    // Evaluate source collection
    // The source is an array containing the actual source node
    const sourceNode = Array.isArray(directive.values.source) 
      ? directive.values.source[0] 
      : directive.values.source;
    
    const sourceResult = await evaluate(sourceNode, env);
    const sourceValue = sourceResult.value;
    const iterable = toIterable(sourceValue);

    if (!iterable) {
      const receivedType = typeof sourceValue;
      const preview = (() => {
        try {
          if (receivedType === 'object') return JSON.stringify(sourceValue)?.slice(0, 120);
          return String(sourceValue)?.slice(0, 120);
        } catch { return String(sourceValue); }
      })();
      throw new MlldDirectiveError(
        `Type mismatch: /for expects an array. Received: ${receivedType}${preview ? ` (${preview})` : ''}`,
        'for',
        { location: directive.location, context: { expected: 'array', receivedType } }
      );
    }

    // Determine parallel options (directive-specified or inherited from parent scope)
    const specified = (directive.values as any).forOptions as { parallel?: boolean; cap?: number; rateMs?: number } | undefined;
    const inherited = (env as any).__forOptions as typeof specified | undefined;
    const effective = specified ?? inherited;

    const iterableArray = Array.from(iterable);

    const runOne = async (entry: [any, any], idx: number) => {
      const [key, value] = entry;
      let childEnv = env.createChildEnvironment();
      // Inherit forOptions for nested loops if set
      if (effective) (childEnv as any).__forOptions = effective;
      const iterationVar = ensureVariable(varName, value, env);
      childEnv.setVariable(varName, iterationVar);
      if (key !== null && typeof key === 'string') {
        const keyVar = ensureVariable(`${varName}_key`, key, env);
        childEnv.setVariable(`${varName}_key`, keyVar);
      }

      const actionNodes = directive.values.action;
      const retry = new RateLimitRetry();
      while (true) {
        try {
          let actionResult: any = { value: undefined, env: childEnv };
          for (const actionNode of actionNodes) {
            actionResult = await evaluate(actionNode, childEnv);
            if (actionResult.env) childEnv = actionResult.env;
          }
          // Emit bare exec output as effect (legacy behavior)
          if (
            directive.values.action.length === 1 &&
            directive.values.action[0].type === 'ExecInvocation' &&
            actionResult.value !== undefined && actionResult.value !== null
          ) {
            const outputContent = String(actionResult.value) + '\n';
            env.emitEffect('both', outputContent, { source: directive.values.action[0].location });
          }
          retry.reset();
          break;
        } catch (err: any) {
          if (isRateLimitError(err)) {
            const again = await retry.wait();
            if (again) continue;
          }
          throw err;
        }
      }
      return;
    };

    if (effective?.parallel) {
      const cap = Math.min(effective.cap ?? getParallelLimit(), iterableArray.length);
      await runWithConcurrency(iterableArray, cap, runOne, { ordered: false, paceMs: effective.rateMs });
    } else {
      for (let i = 0; i < iterableArray.length; i++) {
        await runOne(iterableArray[i], i);
      }
    }
    
  } finally {
    env.popDirective();
  }
  
  // For directives don't produce a direct output value
  return { value: undefined, env };
}

export async function evaluateForExpression(
  expr: ForExpression,
  env: Environment
): Promise<ArrayVariable> {
  const varName = expr.variable.identifier;

  // Evaluate source collection
  const sourceResult = await evaluate(expr.source, env, { isExpression: true });
  const sourceValue = sourceResult.value;
  const iterable = toIterable(sourceValue);

  if (!iterable) {
    const receivedType = typeof sourceValue;
    const preview = (() => {
      try {
        if (receivedType === 'object') return JSON.stringify(sourceValue)?.slice(0, 120);
        return String(sourceValue)?.slice(0, 120);
      } catch { return String(sourceValue); }
    })();
    throw new MlldDirectiveError(
      `Type mismatch: /for expects an array. Received: ${receivedType}${preview ? ` (${preview})` : ''}`,
      'for',
      { location: expr.location, context: { expected: 'array', receivedType } }
    );
  }

  const results: unknown[] = [];
  const errors: Array<{ index: number; error: Error; value: unknown }> = [];

  const specified = (expr.meta as any)?.forOptions as { parallel?: boolean; cap?: number; rateMs?: number } | undefined;
  const inherited = (env as any).__forOptions as typeof specified | undefined;
  const effective = specified ?? inherited;

  const iterableArray = Array.from(iterable);

  const SKIP = Symbol('skip');
  const runOne = async (entry: [any, any], idx: number) => {
    const [key, value] = entry;
    let childEnv = env.createChildEnvironment();
    if (effective) (childEnv as any).__forOptions = effective;
    const iterationVar = ensureVariable(varName, value, env);
    childEnv.setVariable(varName, iterationVar);
    if (key !== null && typeof key === 'string') {
      const keyVar = ensureVariable(`${varName}_key`, key, env);
      childEnv.setVariable(`${varName}_key`, keyVar);
    }
    try {
      let exprResult: unknown = null;
      if (Array.isArray(expr.expression) && expr.expression.length > 0) {
        let nodesToEvaluate = expr.expression;
        if (
          expr.expression.length === 1 &&
          (expr.expression[0] as any).content &&
          (expr.expression[0] as any).wrapperType &&
          !(expr.expression[0] as any).hasInterpolation
        ) {
          nodesToEvaluate = (expr.expression[0] as any).content;
        }
        const result = await evaluate(nodesToEvaluate, childEnv, { isExpression: true });
        if (result.env) childEnv = result.env;
        let branchValue = result?.value;
        if (isStructuredValue(branchValue)) {
          try {
            branchValue = asData(branchValue);
          } catch {
            branchValue = asText(branchValue);
          }
        }
        if (branchValue === 'skip') {
          return SKIP as any;
        }
        if (isVariable(branchValue)) {
          exprResult = await extractVariableValue(branchValue, childEnv);
        } else {
          exprResult = branchValue;
        }
        if (typeof exprResult === 'string' && looksLikeJsonString(exprResult)) {
          try {
            exprResult = JSON.parse(exprResult.trim());
          } catch {
            // keep original string if parsing fails
          }
        }
      }
      return exprResult as any;
    } catch (error) {
      errors.push({ index: idx, error: error as Error, value });
      return null as any;
    }
  };

  if (effective?.parallel) {
    const cap = Math.min(effective.cap ?? getParallelLimit(), iterableArray.length);
    const orderedResults = await runWithConcurrency(iterableArray, cap, runOne, { ordered: true, paceMs: effective.rateMs });
    for (const r of orderedResults) if (r !== SKIP) results.push(r);
  } else {
    for (let i = 0; i < iterableArray.length; i++) {
      const r = await runOne(iterableArray[i], i);
      if (r !== SKIP) results.push(r);
    }
  }

  let finalResults: unknown = results;
  const batchPipelineConfig = expr.meta?.batchPipeline;
  const batchStages = Array.isArray(batchPipelineConfig)
    ? batchPipelineConfig
    : batchPipelineConfig?.pipeline;

  if (batchStages && batchStages.length > 0) {
    const { processPipeline } = await import('./pipeline/unified-processor');
    const batchInput = createArrayVariable(
      'for-batch-input',
      results,
      false,
      {
        directive: 'for',
        syntax: 'expression',
        hasInterpolation: false,
        isMultiLine: false
      },
      { isBatchInput: true }
    );

    try {
      const pipelineResult = await processPipeline({
        value: batchInput,
        env,
        pipeline: batchStages,
        identifier: `for-batch-${expr.variable.identifier}`,
        location: expr.location,
        isRetryable: false
      });

      if (isStructuredValue(pipelineResult)) {
        finalResults = asData(pipelineResult);
      } else if (isVariable(pipelineResult)) {
        finalResults = await extractVariableValue(pipelineResult, env);
      } else {
        finalResults = pipelineResult;
      }
    } catch (error) {
      logger.warn(
        `Batch pipeline failed for for-expression: ${error instanceof Error ? error.message : String(error)}`
      );
      errors.push({
        index: -1,
        error: error as Error,
        value: results
      });
      finalResults = results;
    }
  }

  const variableSource = {
    directive: 'for',
    syntax: 'expression',
    hasInterpolation: false,
    isMultiLine: false
  };

  const metadata: any = {
    sourceExpression: expr.expression,
    iterationVariable: expr.variable.identifier
  };

  if (batchStages && batchStages.length > 0) {
    metadata.hadBatchPipeline = true;
  }

  if (errors.length > 0) {
    metadata.forErrors = errors;
  }

  if (Array.isArray(finalResults)) {
    metadata.arrayType = 'for-expression-result';
    return createArrayVariable(
      'for-result',
      finalResults,
      false,
      variableSource,
      metadata
    );
  }

  if (finalResults === undefined) {
    return createPrimitiveVariable(
      'for-result',
      null,
      variableSource,
      metadata
    );
  }

  if (
    finalResults === null ||
    typeof finalResults === 'number' ||
    typeof finalResults === 'boolean'
  ) {
    return createPrimitiveVariable(
      'for-result',
      finalResults as number | boolean | null,
      variableSource,
      metadata
    );
  }

  if (typeof finalResults === 'string') {
    return createSimpleTextVariable(
      'for-result',
      finalResults,
      variableSource,
      metadata
    );
  }

  if (typeof finalResults === 'object') {
    return createObjectVariable(
      'for-result',
      finalResults,
      false,
      variableSource,
      metadata
    );
  }

  return createSimpleTextVariable(
    'for-result',
    String(finalResults),
    variableSource,
    metadata
  );
}
