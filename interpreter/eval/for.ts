import type {
  ForDirective,
  ForExpression,
  Environment,
  ArrayVariable,
  Variable
} from '@core/types';
import { evaluate, type EvalResult } from '../core/interpreter';
import { MlldDirectiveError } from '@core/errors';
import { toIterable } from './for-utils';
import { getParallelLimit, runWithConcurrency } from '@interpreter/utils/parallel';
import { createArrayVariable, createObjectVariable, createPrimitiveVariable, createSimpleTextVariable } from '@core/types/variable';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { logger } from '@core/utils/logger';
import { DebugUtils } from '../env/DebugUtils';
import {
  asData,
  asText,
  isStructuredValue,
  extractSecurityDescriptor
} from '../utils/structured-value';
import { setExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import { updateVarMxFromDescriptor, varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { isExeReturnControl } from './exe-return';
import { resolveParallelOptions, type ForParallelOptions } from './for/parallel-options';
import { executeDirectiveActions } from './for/directive-action-runner';
import { evaluateForExpressionIteration } from './for/expression-runner';
import { applyForExpressionBatchPipeline } from './for/batch-pipeline';
import {
  assertKeyVariableHasNoFields,
  formatFieldPath
} from './for/binding-utils';
import {
  popExpressionIterationContexts,
  popForIterationContext,
  pushExpressionIterationContext,
  setupIterationContext
} from './for/iteration-runner';
import type { ForIterationError } from './for/types';

function formatIterationError(error: unknown): string {
  if (error instanceof Error) {
    let message = error.message;
    // Strip directive wrapper noise for user-facing markers
    if (message.startsWith('Directive error (')) {
      const prefixEnd = message.indexOf(': ');
      if (prefixEnd >= 0) {
        message = message.slice(prefixEnd + 2);
      }
      const lineIndex = message.indexOf(' at line ');
      if (lineIndex >= 0) {
        message = message.slice(0, lineIndex);
      }
    }
    return message;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function extractControlKind(value: unknown): 'done' | 'continue' | null {
  const v = isStructuredValue(value) ? asData(value) : value;
  if (v && typeof v === 'object' && '__whileControl' in (v as any)) {
    return (v as any).__whileControl === 'done' ? 'done' : 'continue';
  }
  if (v && typeof v === 'object' && 'valueType' in (v as any)) {
    const vt = (v as any).valueType;
    if (vt === 'done') return 'done';
    if (vt === 'continue') return 'continue';
  }
  if (v === 'done') return 'done';
  if (v === 'continue') return 'continue';
  return null;
}

function resetForErrorsContext(env: Environment, errors: ForIterationError[]): void {
  const mxManager = env.getContextManager?.();
  if (!mxManager) return;
  while (mxManager.popGenericContext('for')) {
    // clear previous loop context
  }
  mxManager.pushGenericContext('for', { errors, timestamp: Date.now() });
  mxManager.setLatestErrors(errors);
}

export async function evaluateForDirective(
  directive: ForDirective,
  env: Environment
): Promise<EvalResult> {
  const varNode = directive.values.variable[0];
  const keyNode = directive.values.key?.[0];
  assertKeyVariableHasNoFields(keyNode, directive.location);
  const varName = varNode.identifier;
  const keyVarName = keyNode?.identifier;
  const varFields = varNode.fields;
  const fieldPathString = formatFieldPath(varFields);
  
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
        `Type mismatch: for expects an array. Received: ${receivedType}${preview ? ` (${preview})` : ''}`,
        'for',
        { location: directive.location, context: { expected: 'array', receivedType } }
      );
    }

    // Determine parallel options (directive-specified or inherited from parent scope)
    const specified = (directive.values as any).forOptions as ForParallelOptions | undefined;
    const inherited = (env as any).__forOptions as ForParallelOptions | undefined;
    const effective = await resolveParallelOptions(specified ?? inherited, env, directive.location);

    const iterableArray = Array.from(iterable);
    const forErrors = effective?.parallel ? ([] as ForIterationError[]) : null;
    if (forErrors) {
      resetForErrorsContext(env, forErrors);
    }

    const runOne = async (entry: [any, any], idx: number) => {
      const setup = await setupIterationContext({
        rootEnv: env,
        entry,
        index: idx,
        total: iterableArray.length,
        effective,
        varName,
        keyVarName,
        varFields,
        fieldPathString,
        sourceLocation: varNode.location
      });
      const { iterationRoot, key, value } = setup;
      let childEnv = setup.childEnv;
      let returnControl: unknown = null;

      try {
        const actionResult = await executeDirectiveActions({
          directive,
          env,
          childEnv,
          iterationRoot,
          effective,
          extractControlKind
        });
        childEnv = actionResult.childEnv;
        returnControl = actionResult.returnControl;
      } catch (err: any) {
        popForIterationContext(childEnv);
        if (forErrors) {
          forErrors.push({
            index: idx,
            key: key ?? null,
            message: formatIterationError(err),
            error: formatIterationError(err),
            value
          });
          return;
        }
        throw err;
      }

      popForIterationContext(childEnv);
      return returnControl;
    };

    if (effective?.parallel) {
      const cap = Math.min(effective.cap ?? getParallelLimit(), iterableArray.length);
      const results = await runWithConcurrency(iterableArray, cap, runOne, { ordered: false, paceMs: effective.rateMs });
      const returnControl = results.find(result => isExeReturnControl(result));
      if (returnControl) {
        return { value: returnControl, env };
      }
    } else {
      for (let i = 0; i < iterableArray.length; i++) {
        const result = await runOne(iterableArray[i], i);
        if (isExeReturnControl(result)) {
          return { value: result, env };
        }
        if (result && typeof result === 'object' && (result as any).__forDone) {
          break;
        }
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
  const keyNode = expr.keyVariable;
  assertKeyVariableHasNoFields(keyNode, expr.location);
  const keyVarName = keyNode?.identifier;
  const varName = expr.variable.identifier;
  const varFields = expr.variable.fields;
  const fieldPathString = formatFieldPath(varFields);

  // Evaluate source collection
  const sourceResult = await evaluate(expr.source, env, { isExpression: true });
  const sourceValue = sourceResult.value;
  // Extract security descriptor from the source collection (e.g., array of tainted values)
  // This taint must flow through to the for-expression results
  let sourceDescriptor = extractSecurityDescriptor(sourceValue, { recursive: true, mergeArrayElements: true });
  // If value extraction lost the descriptor, check the source Variable's .mx
  if (!sourceDescriptor) {
    const sourceNode = Array.isArray(expr.source) ? (expr.source as any)[0] : expr.source;
    const sourceVarName = sourceNode?.identifier ?? sourceNode?.name;
    if (sourceVarName) {
      const sourceVar = env.getVariable(sourceVarName);
      if (sourceVar?.mx) {
        const varDescriptor = varMxToSecurityDescriptor(sourceVar.mx);
        if (varDescriptor.labels.length > 0 || varDescriptor.taint.length > 0) {
          sourceDescriptor = varDescriptor;
        }
      }
    }
  }
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
      `Type mismatch: for expects an array. Received: ${receivedType}${preview ? ` (${preview})` : ''}`,
      'for',
      { location: expr.location, context: { expected: 'array', receivedType } }
    );
  }

  const results: unknown[] = [];
  const errors: ForIterationError[] = [];

  const specified = (expr.meta as any)?.forOptions as ForParallelOptions | undefined;
  const inherited = (env as any).__forOptions as ForParallelOptions | undefined;
  const effective = await resolveParallelOptions(specified ?? inherited, env, expr.location);
  if (effective?.parallel) {
    resetForErrorsContext(env, errors);
  }

  const iterableArray = Array.from(iterable);

  const SKIP = Symbol('skip');
  const DONE = Symbol('done');
  const runOne = async (entry: [any, any], idx: number) => {
    const setup = await setupIterationContext({
      rootEnv: env,
      entry,
      index: idx,
      total: iterableArray.length,
      effective,
      varName,
      keyVarName,
      varFields,
      fieldPathString,
      sourceLocation: expr.variable.location
    });
    let childEnv = setup.childEnv;
    const { key, value } = setup;
    // Push exe context so if/when blocks inside for-expression blocks can use => returns
    pushExpressionIterationContext(childEnv);

    try {
      const iterationResult = await evaluateForExpressionIteration({
        expr,
        childEnv,
        value,
        sourceDescriptor,
        extractControlKind
      });
      childEnv = iterationResult.childEnv;
      popExpressionIterationContexts(childEnv);
      if (iterationResult.outcome === 'skip') {
        return SKIP as any;
      }
      if (iterationResult.outcome === 'done') {
        return DONE as any;
      }
      return iterationResult.value as any;
    } catch (error) {
      popExpressionIterationContexts(childEnv);
      if (!effective?.parallel) {
        throw error;
      }
      const message = formatIterationError(error);
      logger.warn(`for parallel iteration ${idx} error: ${message}`);
      env.emitEffect('stderr', `  \u26a0 for iteration ${idx} error: ${message}\n`, { source: expr.location });
      const marker: ForIterationError = {
        index: idx,
        key: key ?? null,
        message,
        error: message,
        value
      };
      errors.push(marker);
      return marker as any;
    }
  };

  if (effective?.parallel) {
    const cap = Math.min(effective.cap ?? getParallelLimit(), iterableArray.length);
    const orderedResults = await runWithConcurrency(iterableArray, cap, runOne, { ordered: true, paceMs: effective.rateMs });
    for (const r of orderedResults) if (r !== SKIP && r !== DONE) results.push(r);
  } else {
    for (let i = 0; i < iterableArray.length; i++) {
      const r = await runOne(iterableArray[i], i);
      if (r === DONE) break;
      if (r !== SKIP) results.push(r);
    }
  }

  const batchPipelineResult = await applyForExpressionBatchPipeline({
    expr,
    env,
    results,
    errors
  });
  const finalResults = batchPipelineResult.finalResults;

  const variableSource = {
    directive: 'for',
    syntax: 'expression',
    hasInterpolation: false,
    isMultiLine: false
  };

  const metadata: Record<string, unknown> = {
    sourceExpression: expr.expression,
    iterationVariable: expr.variable.identifier
  };

  if (batchPipelineResult.hadBatchPipeline) {
    metadata.hadBatchPipeline = true;
  }

  if (errors.length > 0) {
    metadata.forErrors = errors;
  }

  // Merge security descriptors from all result elements and the source
  // to propagate taint to the final for-expression result variable
  const resultElementDescriptors = (Array.isArray(finalResults) ? finalResults : [finalResults])
    .map(r => extractSecurityDescriptor(r))
    .filter(Boolean) as SecurityDescriptor[];
  if (sourceDescriptor) {
    resultElementDescriptors.push(sourceDescriptor);
  }
  const forResultDescriptor = resultElementDescriptors.length > 0
    ? (resultElementDescriptors.length === 1 ? resultElementDescriptors[0] : mergeDescriptors(...resultElementDescriptors))
    : undefined;

  // Also propagate descriptor to the results array object itself
  if (forResultDescriptor && Array.isArray(finalResults)) {
    setExpressionProvenance(finalResults, forResultDescriptor);
  }

  if (Array.isArray(finalResults)) {
    const arrayVar = createArrayVariable(
      'for-result',
      finalResults,
      false,
      variableSource,
      {
        metadata,
        internal: {
          arrayType: 'for-expression-result'
        }
      }
    );
    if (forResultDescriptor && arrayVar.mx) {
      updateVarMxFromDescriptor(arrayVar.mx, forResultDescriptor);
    }
    return arrayVar;
  }

  // Helper to apply forResultDescriptor to a variable's mx
  const applyForDescriptor = <T extends Variable>(variable: T): T => {
    if (forResultDescriptor && variable.mx) {
      updateVarMxFromDescriptor(variable.mx, forResultDescriptor);
    }
    return variable;
  };

  if (finalResults === undefined) {
    return applyForDescriptor(createPrimitiveVariable(
      'for-result',
      null,
      variableSource,
      { mx: metadata }
    ));
  }

  if (
    finalResults === null ||
    typeof finalResults === 'number' ||
    typeof finalResults === 'boolean'
  ) {
    return applyForDescriptor(createPrimitiveVariable(
      'for-result',
      finalResults as number | boolean | null,
      variableSource,
      { mx: metadata }
    ));
  }

  if (typeof finalResults === 'string') {
    return applyForDescriptor(createSimpleTextVariable(
      'for-result',
      finalResults,
      variableSource,
      { mx: metadata }
    ));
  }

  if (typeof finalResults === 'object') {
    return applyForDescriptor(createObjectVariable(
      'for-result',
      finalResults,
      false,
      variableSource,
      { mx: metadata }
    ));
  }

  return applyForDescriptor(createSimpleTextVariable(
    'for-result',
    String(finalResults),
    variableSource,
    { mx: metadata }
  ));
}
