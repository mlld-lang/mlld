import type { ForDirective, ForExpression, Environment, ArrayVariable, Variable, FieldAccessNode, SourceLocation } from '@core/types';
import { evaluate, type EvalResult } from '../core/interpreter';
import { FieldAccessError, MlldDirectiveError } from '@core/errors';
import { toIterable } from './for-utils';
import { getParallelLimit, runWithConcurrency } from '@interpreter/utils/parallel';
import { RateLimitRetry, isRateLimitError } from '../eval/pipeline/rate-limit-retry';
import { createArrayVariable, createObjectVariable, createPrimitiveVariable, createSimpleTextVariable } from '@core/types/variable';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { VariableImporter } from './import/VariableImporter';
import { logger } from '@core/utils/logger';
import { DebugUtils } from '../env/DebugUtils';
import { isLoadContentResult } from '@core/types/load-content';
import {
  asData,
  asText,
  isStructuredValue,
  looksLikeJsonString,
  normalizeWhenShowEffect
} from '../utils/structured-value';
import { materializeDisplayValue } from '../utils/display-materialization';
import { accessFields } from '../utils/field-access';
import { inheritExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { evaluateWhenExpression } from './when-expression';
import { isAugmentedAssignment, isLetAssignment } from '@core/types/when';
import { evaluateAugmentedAssignment, evaluateLetAssignment } from './when';

interface ForIterationError {
  index: number;
  key?: string | number | null;
  message: string;
  error: string;
  value?: unknown;
}

// Helper to ensure a value is wrapped as a Variable
function ensureVariable(name: string, value: unknown, env: Environment): Variable {
  // If already a Variable, return as-is
  if (isVariable(value)) {
    return value;
  }
  
  // Special handling for LoadContentResult objects and StructuredValue arrays
  // These need to be preserved as objects with their special metadata
  if (isLoadContentResult(value)) {
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
        source: 'for-loop'
      }
    );
  }

  if (isStructuredValue(value) && value.type === 'array') {
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
        arrayType: 'structured-value-array',
        source: 'for-loop'
      }
    );
  }
  
  // Otherwise, create a Variable from the value
  const importer = new VariableImporter();
  return importer.createVariableFromValue(name, value, 'for-loop', undefined, { env });
}

function formatFieldPath(fields?: FieldAccessNode[]): string | null {
  if (!fields || fields.length === 0) {
    return null;
  }
  const parts: string[] = [];
  for (const field of fields) {
    const value = field.value;
    switch (field.type) {
      case 'field':
      case 'stringIndex':
      case 'bracketAccess':
      case 'numericField':
        parts.push(typeof value === 'number' ? String(value) : String(value ?? ''));
        break;
      case 'arrayIndex':
      case 'variableIndex':
        parts.push(`[${typeof value === 'number' ? value : String(value ?? '')}]`);
        break;
      case 'arraySlice':
        parts.push(`[${field.start ?? ''}:${field.end ?? ''}]`);
        break;
      case 'arrayFilter':
        parts.push('[?]');
        break;
      default:
        parts.push(String(value ?? ''));
        break;
    }
  }

  return parts
    .map((part, index) => (part.startsWith('[') || index === 0 ? part : `.${part}`))
    .join('');
}

function enhanceFieldAccessError(
  error: unknown,
  options: { fieldPath?: string | null; varName: string; index: number; key: string | null; sourceLocation?: SourceLocation }
): unknown {
  if (!(error instanceof FieldAccessError)) {
    return error;
  }
  const pathSuffix = options.fieldPath ? `.${options.fieldPath}` : '';
  const contextParts: string[] = [];
  if (options.key !== null && options.key !== undefined) {
    contextParts.push(`key ${String(options.key)}`);
  } else if (options.index >= 0) {
    contextParts.push(`index ${options.index}`);
  }
  const context = contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';
  const message = `${error.message} in for binding @${options.varName}${pathSuffix}${context}`;
  const enhancedDetails = {
    ...(error.details || {}),
    iterationIndex: options.index,
    iterationKey: options.key
  };
  return new FieldAccessError(message, enhancedDetails, {
    cause: error,
    sourceLocation: (error as any).sourceLocation ?? options.sourceLocation
  });
}

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

function resetForErrorsContext(env: Environment, errors: ForIterationError[]): void {
  const mxManager = env.getContextManager?.();
  if (!mxManager) return;
  while (mxManager.popGenericContext('for')) {
    // clear previous loop context
  }
  mxManager.pushGenericContext('for', { errors, timestamp: Date.now() });
  mxManager.setLatestErrors(errors);
}

function findVariableOwner(env: Environment, name: string): Environment | undefined {
  let current: Environment | undefined = env;
  while (current) {
    if (current.getCurrentVariables().has(name)) return current;
    current = current.getParent();
  }
  return undefined;
}

function isDescendantEnvironment(env: Environment, ancestor: Environment): boolean {
  let current: Environment | undefined = env;
  while (current) {
    if (current === ancestor) return true;
    current = current.getParent();
  }
  return false;
}

export async function evaluateForDirective(
  directive: ForDirective,
  env: Environment
): Promise<EvalResult> {
  const varNode = directive.values.variable[0];
  const varName = varNode.identifier;
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
    const forErrors = effective?.parallel ? ([] as ForIterationError[]) : null;
    if (forErrors) {
      resetForErrorsContext(env, forErrors);
    }

    const runOne = async (entry: [any, any], idx: number) => {
      const [key, value] = entry;
      const iterationRoot = env.createChildEnvironment();
      if (effective?.parallel) {
        (iterationRoot as any).__parallelIsolationRoot = iterationRoot;
      }
      let childEnv = iterationRoot;
      // Inherit forOptions for nested loops if set
      if (effective) (childEnv as any).__forOptions = effective;
      let derivedValue: unknown;
      if (varFields && varFields.length > 0) {
        try {
          const accessed = await accessFields(value, varFields, {
            env: childEnv,
            preserveContext: true,
            sourceLocation: varNode.location
          });
          derivedValue = (accessed as any)?.value ?? accessed;
          inheritExpressionProvenance(derivedValue, value);
        } catch (error) {
          throw enhanceFieldAccessError(error, {
            fieldPath: fieldPathString,
            varName,
            index: idx,
            key: key ?? null,
            sourceLocation: varNode.location
          }) as Error;
        }
      }
      const iterationVar = ensureVariable(varName, value, env);
      childEnv.setVariable(varName, iterationVar);
      if (typeof derivedValue !== 'undefined' && fieldPathString) {
        const derivedVar = ensureVariable(`${varName}.${fieldPathString}`, derivedValue, env);
        childEnv.setVariable(`${varName}.${fieldPathString}`, derivedVar);
      }
      if (key !== null && typeof key === 'string') {
        const keyVar = ensureVariable(`${varName}_key`, key, env);
        childEnv.setVariable(`${varName}_key`, keyVar);
      }

      const actionNodes = directive.values.action;
      const retry = new RateLimitRetry();
      while (true) {
        try {
          if (directive.meta?.actionType === 'block') {
            let blockEnv = childEnv;
            for (const actionNode of actionNodes) {
              if (isLetAssignment(actionNode)) {
                blockEnv = await evaluateLetAssignment(actionNode, blockEnv);
              } else if (isAugmentedAssignment(actionNode)) {
                if (effective?.parallel) {
                  const owner = findVariableOwner(blockEnv, actionNode.identifier);
                  if (!owner || !isDescendantEnvironment(owner, iterationRoot)) {
                    throw new MlldDirectiveError(
                      `Parallel for block cannot mutate outer variable @${actionNode.identifier}.`,
                      'for',
                      { location: actionNode.location }
                    );
                  }
                }
                blockEnv = await evaluateAugmentedAssignment(actionNode, blockEnv);
              } else if (actionNode.type === 'WhenExpression' && actionNode.meta?.modifier !== 'first') {
                const nodeWithFirst = {
                  ...actionNode,
                  meta: { ...(actionNode.meta || {}), modifier: 'first' as const }
                };
                const actionResult = await evaluateWhenExpression(nodeWithFirst as any, blockEnv);
                blockEnv = actionResult.env || blockEnv;
              } else {
                const actionResult = await evaluate(actionNode, blockEnv);
                blockEnv = actionResult.env || blockEnv;
              }
            }
            childEnv = blockEnv;
          } else {
            let actionResult: any = { value: undefined, env: childEnv };
            for (const actionNode of actionNodes) {
              if (actionNode.type === 'WhenExpression' && actionNode.meta?.modifier !== 'first') {
                const nodeWithFirst = {
                  ...actionNode,
                  meta: { ...(actionNode.meta || {}), modifier: 'first' as const }
                };
                actionResult = await evaluateWhenExpression(nodeWithFirst as any, childEnv);
              } else {
                actionResult = await evaluate(actionNode, childEnv);
              }
              if (actionResult.env) childEnv = actionResult.env;
            }
            // Emit bare exec output as effect (legacy behavior)
            if (
              directive.values.action.length === 1 &&
              directive.values.action[0].type === 'ExecInvocation' &&
              actionResult.value !== undefined && actionResult.value !== null
            ) {
              const materialized = materializeDisplayValue(
                actionResult.value,
                undefined,
                actionResult.value
              );
              let outputContent = materialized.text;
              if (!outputContent.endsWith('\n')) {
                outputContent += '\n';
              }
              if (materialized.descriptor) {
                env.recordSecurityDescriptor(materialized.descriptor);
              }
              env.emitEffect('both', outputContent, { source: directive.values.action[0].location });
            }
          }
          retry.reset();
          break;
        } catch (err: any) {
          if (isRateLimitError(err)) {
            const again = await retry.wait();
            if (again) continue;
          }
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
  const varFields = expr.variable.fields;
  const fieldPathString = formatFieldPath(varFields);

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
  const errors: ForIterationError[] = [];

  const specified = (expr.meta as any)?.forOptions as { parallel?: boolean; cap?: number; rateMs?: number } | undefined;
  const inherited = (env as any).__forOptions as typeof specified | undefined;
  const effective = specified ?? inherited;
  if (effective?.parallel) {
    resetForErrorsContext(env, errors);
  }

  const iterableArray = Array.from(iterable);

  const SKIP = Symbol('skip');
  const runOne = async (entry: [any, any], idx: number) => {
    const [key, value] = entry;
    const iterationRoot = env.createChildEnvironment();
    if (effective?.parallel) {
      (iterationRoot as any).__parallelIsolationRoot = iterationRoot;
    }
    let childEnv = iterationRoot;
    if (effective) (childEnv as any).__forOptions = effective;
    let derivedValue: unknown;
    if (varFields && varFields.length > 0) {
      try {
        const accessed = await accessFields(value, varFields, {
          env: childEnv,
          preserveContext: true,
          sourceLocation: expr.variable.location
        });
        derivedValue = (accessed as any)?.value ?? accessed;
        inheritExpressionProvenance(derivedValue, value);
      } catch (error) {
        throw enhanceFieldAccessError(error, {
          fieldPath: fieldPathString,
          varName,
          index: idx,
          key: key ?? null,
          sourceLocation: expr.variable.location
        }) as Error;
      }
    }
    const iterationVar = ensureVariable(varName, value, env);
    childEnv.setVariable(varName, iterationVar);
    if (typeof derivedValue !== 'undefined' && fieldPathString) {
      const derivedVar = ensureVariable(`${varName}.${fieldPathString}`, derivedValue, env);
      childEnv.setVariable(`${varName}.${fieldPathString}`, derivedVar);
    }
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

        let result: EvalResult;
        if (
          nodesToEvaluate.length === 1 &&
          (nodesToEvaluate[0] as any).type === 'WhenExpression' &&
          (nodesToEvaluate[0] as any).meta?.modifier !== 'first'
        ) {
          const nodeWithFirst = {
            ...(nodesToEvaluate[0] as any),
            meta: { ...((nodesToEvaluate[0] as any).meta || {}), modifier: 'first' as const }
          };
          result = await evaluateWhenExpression(nodeWithFirst as any, childEnv);
        } else {
          result = await evaluate(nodesToEvaluate, childEnv, { isExpression: true });
        }

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

        // Preserve directive-produced text (e.g., show/run) when they tag side effects
        exprResult = normalizeWhenShowEffect(exprResult).normalized;

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
      const message = formatIterationError(error);
      const marker: ForIterationError = {
        index: idx,
        key: key ?? null,
        message,
        error: message,
        value
      };
      errors.push(marker);
      if (effective?.parallel) {
        return marker as any;
      }
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

  const metadata: Record<string, unknown> = {
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
    return createArrayVariable(
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
  }

  if (finalResults === undefined) {
    return createPrimitiveVariable(
      'for-result',
      null,
      variableSource,
      { mx: metadata }
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
      { mx: metadata }
    );
  }

  if (typeof finalResults === 'string') {
    return createSimpleTextVariable(
      'for-result',
      finalResults,
      variableSource,
      { mx: metadata }
    );
  }

  if (typeof finalResults === 'object') {
    return createObjectVariable(
      'for-result',
      finalResults,
      false,
      variableSource,
      { mx: metadata }
    );
  }

  return createSimpleTextVariable(
    'for-result',
    String(finalResults),
    variableSource,
    { mx: metadata }
  );
}
