import type {
  ForDirective,
  ForExpression,
  Environment,
  ArrayVariable,
  Variable,
  VariableReferenceNode
} from '@core/types';
import { evaluate, type EvalResult } from '../core/interpreter';
import { FieldAccessError, MlldDirectiveError } from '@core/errors';
import { toIterable } from './for-utils';
import { getParallelLimit, runWithConcurrency } from '@interpreter/utils/parallel';
import { RateLimitRetry, isRateLimitError } from '../eval/pipeline/rate-limit-retry';
import { createArrayVariable, createObjectVariable, createPrimitiveVariable, createSimpleTextVariable } from '@core/types/variable';
import { isVariable, extractVariableValue } from '../utils/variable-resolution';
import { logger } from '@core/utils/logger';
import { DebugUtils } from '../env/DebugUtils';
import {
  asData,
  asText,
  isStructuredValue,
  looksLikeJsonString,
  normalizeWhenShowEffect,
  extractSecurityDescriptor
} from '../utils/structured-value';
import { materializeDisplayValue } from '../utils/display-materialization';
import { accessFields } from '../utils/field-access';
import { inheritExpressionProvenance, setExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import { mergeDescriptors, type SecurityDescriptor } from '@core/types/security';
import { updateVarMxFromDescriptor, varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import { evaluateWhenExpression } from './when-expression';
import { isAugmentedAssignment, isLetAssignment } from '@core/types/when';
import { evaluateAugmentedAssignment, evaluateLetAssignment } from './when';
import { isExeReturnControl } from './exe-return';
import { isControlCandidate } from './loop';
import { resolveParallelOptions, type ForParallelOptions } from './for/parallel-options';
import {
  assertKeyVariableHasNoFields,
  ensureVariable,
  enhanceFieldAccessError,
  formatFieldNodeForError,
  formatFieldPath,
  isFieldAccessResultLike,
  shouldKeepStructuredForForExpression,
  withIterationMxKey
} from './for/binding-utils';

interface ForIterationError {
  index: number;
  key?: string | number | null;
  message: string;
  error: string;
  value?: unknown;
}

interface ForContextSnapshot {
  index: number;
  total: number;
  key: string | number | null;
  parallel: boolean;
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
            returnUndefinedForMissing: true,
            sourceLocation: varNode.location
          });
          const accessedValue = isFieldAccessResultLike(accessed) ? accessed.value : accessed;
          if (typeof accessedValue === 'undefined') {
            const missingField = formatFieldNodeForError(varFields[varFields.length - 1]);
            const accessPath = isFieldAccessResultLike(accessed) && Array.isArray(accessed.accessPath)
              ? accessed.accessPath
              : [];
            throw new FieldAccessError(`Field "${missingField}" not found in object`, {
              baseValue: value,
              fieldAccessChain: [],
              failedAtIndex: Math.max(0, varFields.length - 1),
              failedKey: missingField,
              accessPath
            }, {
              sourceLocation: varNode.location,
              env: childEnv
            });
          }
          derivedValue = accessedValue;
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
      childEnv.setVariable(varName, withIterationMxKey(iterationVar, key));
      if (typeof derivedValue !== 'undefined' && fieldPathString) {
        const derivedVar = ensureVariable(`${varName}.${fieldPathString}`, derivedValue, env);
        childEnv.setVariable(`${varName}.${fieldPathString}`, derivedVar);
      }
      if (key !== null && typeof key === 'string') {
        if (keyVarName) {
          const keyVar = ensureVariable(keyVarName, key, env);
          childEnv.setVariable(keyVarName, keyVar);
        } else {
          const keyVar = ensureVariable(`${varName}_key`, key, env);
          childEnv.setVariable(`${varName}_key`, keyVar);
        }
      }

      // Set up for context for @mx.for access
      const forCtx: ForContextSnapshot = {
        index: idx,
        total: iterableArray.length,
        key: key ?? null,
        parallel: !!effective?.parallel
      };
      childEnv.pushExecutionContext('for', forCtx);

      const actionNodes = directive.values.action;
      const retry = new RateLimitRetry();
      let returnControl: unknown = null;
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
              } else if (actionNode.type === 'WhenExpression') {
                const actionResult = await evaluateWhenExpression(actionNode as any, blockEnv);
                blockEnv = actionResult.env || blockEnv;
                if (isExeReturnControl(actionResult.value)) {
                  returnControl = actionResult.value;
                  break;
                }
                if (isControlCandidate(actionResult.value)) {
                  const controlKind = extractControlKind(actionResult.value);
                  if (controlKind === 'done') {
                    returnControl = { __forDone: true };
                  }
                  break;
                }
              } else {
                const actionResult = await evaluate(actionNode, blockEnv);
                blockEnv = actionResult.env || blockEnv;
                if (isExeReturnControl(actionResult.value)) {
                  returnControl = actionResult.value;
                  break;
                }
                if (isControlCandidate(actionResult.value)) {
                  const controlKind = extractControlKind(actionResult.value);
                  if (controlKind === 'done') {
                    returnControl = { __forDone: true };
                  }
                  break;
                }
              }
            }
            childEnv = blockEnv;
            if (returnControl) {
              retry.reset();
              break;
            }
          } else {
            let actionResult: any = { value: undefined, env: childEnv };
            for (const actionNode of actionNodes) {
              if (actionNode.type === 'WhenExpression') {
                actionResult = await evaluateWhenExpression(actionNode as any, childEnv);
              } else {
                actionResult = await evaluate(actionNode, childEnv);
              }
              if (actionResult.env) childEnv = actionResult.env;
              if (isExeReturnControl(actionResult.value)) {
                returnControl = actionResult.value;
                break;
              }
              if (isControlCandidate(actionResult.value)) {
                const controlKind = extractControlKind(actionResult.value);
                if (controlKind === 'done') {
                  returnControl = { __forDone: true };
                }
                break;
              }
            }
            if (returnControl) {
              retry.reset();
              break;
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
          childEnv.popExecutionContext('for');
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
      childEnv.popExecutionContext('for');
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
          returnUndefinedForMissing: true,
          sourceLocation: expr.variable.location
        });
        const accessedValue = isFieldAccessResultLike(accessed) ? accessed.value : accessed;
        if (typeof accessedValue === 'undefined') {
          const missingField = formatFieldNodeForError(varFields[varFields.length - 1]);
          const accessPath = isFieldAccessResultLike(accessed) && Array.isArray(accessed.accessPath)
            ? accessed.accessPath
            : [];
          throw new FieldAccessError(`Field "${missingField}" not found in object`, {
            baseValue: value,
            fieldAccessChain: [],
            failedAtIndex: Math.max(0, varFields.length - 1),
            failedKey: missingField,
            accessPath
          }, {
            sourceLocation: expr.variable.location,
            env: childEnv
          });
        }
        derivedValue = accessedValue;
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
    childEnv.setVariable(varName, withIterationMxKey(iterationVar, key));
    if (typeof derivedValue !== 'undefined' && fieldPathString) {
      const derivedVar = ensureVariable(`${varName}.${fieldPathString}`, derivedValue, env);
      childEnv.setVariable(`${varName}.${fieldPathString}`, derivedVar);
    }
    if (key !== null && typeof key === 'string') {
      if (keyVarName) {
        const keyVar = ensureVariable(keyVarName, key, env);
        childEnv.setVariable(keyVarName, keyVar);
      } else {
        const keyVar = ensureVariable(`${varName}_key`, key, env);
        childEnv.setVariable(`${varName}_key`, keyVar);
      }
    }

    // Set up for context for @mx.for access (matching directive path)
    const forCtx: ForContextSnapshot = {
      index: idx,
      total: iterableArray.length,
      key: key ?? null,
      parallel: !!effective?.parallel
    };
    childEnv.pushExecutionContext('for', forCtx);
    // Push exe context so if/when blocks inside for-expression blocks can use => returns
    childEnv.pushExecutionContext('exe', { allowReturn: true, scope: 'for-expression' });

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

        const simpleVarRef = (() => {
          if (nodesToEvaluate.length !== 1) return null;
          const node = nodesToEvaluate[0] as any;
          if (!node || node.type !== 'VariableReference') return null;
          const hasFields = Array.isArray(node.fields) && node.fields.length > 0;
          const hasPipes = Array.isArray(node.pipes) && node.pipes.length > 0;
          if (hasFields || hasPipes) return null;
          return node as VariableReferenceNode;
        })();

        const evaluateSequence = async (nodes: unknown[], startEnv: Environment): Promise<EvalResult> => {
          let currentEnv = startEnv;
          let lastResult: EvalResult = { value: undefined, env: currentEnv };

          for (const node of nodes) {
            if (isLetAssignment(node as any)) {
              currentEnv = await evaluateLetAssignment(node as any, currentEnv);
              lastResult = { value: undefined, env: currentEnv };
              continue;
            }

            if (isAugmentedAssignment(node as any)) {
              currentEnv = await evaluateAugmentedAssignment(node as any, currentEnv);
              lastResult = { value: undefined, env: currentEnv };
              continue;
            }

            if ((node as any)?.type === 'WhenExpression') {
              lastResult = await evaluateWhenExpression(node as any, currentEnv);
              currentEnv = lastResult.env || currentEnv;
              // Early return: if when matched and returned a value, exit the sequence
              // BUT don't break for side-effect tags (show, output) - those aren't real return values
              if (lastResult.value !== null && lastResult.value !== undefined) {
                if (typeof lastResult.value === 'object' && (lastResult.value as any).__whenEffect) {
                  continue;
                }
                break;
              }
              continue;
            }

            // Allow side effects (show, output) in for-expressions for progress logging
            lastResult = await evaluate(node as any, currentEnv, { isExpression: true, allowEffects: true });
            currentEnv = lastResult.env || currentEnv;

            // Propagate flow control from if/when blocks (matches loop.ts pattern)
            if (isExeReturnControl(lastResult.value)) break;
            if (isControlCandidate(lastResult.value)) break;
          }

          return { value: lastResult.value, env: currentEnv };
        };

        const result = await evaluateSequence(nodesToEvaluate, childEnv);

        if (result.env) childEnv = result.env;
        let branchValue = result?.value;

        // Unwrap ExeReturnControl — use inner value as iteration result
        if (isExeReturnControl(branchValue)) {
          branchValue = (branchValue as any).value;
        }
        // Handle continue/done control signals
        if (branchValue && typeof branchValue === 'object' && '__whileControl' in (branchValue as any)) {
          const control = (branchValue as any).__whileControl;
          if (control === 'continue') {
            childEnv.popExecutionContext('exe');
            childEnv.popExecutionContext('for');
            return SKIP as any;
          }
          if (control === 'done') {
            childEnv.popExecutionContext('exe');
            childEnv.popExecutionContext('for');
            return DONE as any;
          }
        }
        if (isControlCandidate(branchValue)) {
          const controlKind = extractControlKind(branchValue);
          if (controlKind === 'continue') {
            childEnv.popExecutionContext('exe');
            childEnv.popExecutionContext('for');
            return SKIP as any;
          }
          if (controlKind === 'done') {
            childEnv.popExecutionContext('exe');
            childEnv.popExecutionContext('for');
            return DONE as any;
          }
        }

        // Extract security descriptor from branch value before asData strips it
        const branchDescriptor = extractSecurityDescriptor(branchValue);
        // Also extract from the iteration variable (carries source taint)
        const iterVarDescriptor = extractSecurityDescriptor(value);

        if (simpleVarRef) {
          const refVar = childEnv.getVariable(simpleVarRef.identifier);
          const refValue = refVar?.value;
          if (isStructuredValue(refValue) && shouldKeepStructuredForForExpression(refValue)) {
            branchValue = refValue;
          }
        }
        if (isStructuredValue(branchValue)) {
          if (shouldKeepStructuredForForExpression(branchValue)) {
            const derived = (() => {
              try {
                return asData(branchValue);
              } catch {
                return asText(branchValue);
              }
            })();
            if (derived === 'skip') {
              return SKIP as any;
            }
          } else {
            try {
              branchValue = asData(branchValue);
            } catch {
              branchValue = asText(branchValue);
            }
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

        // Propagate security descriptors from source, iteration variable, and branch value
        // This prevents taint stripping through for-expressions
        // Note: only attach to object results via WeakMap provenance.
        // String results are primitives - their taint propagates through the
        // final ArrayVariable's .mx field set by applyForDescriptor.
        const elementDescriptors = [branchDescriptor, iterVarDescriptor, sourceDescriptor].filter(Boolean) as SecurityDescriptor[];
        if (elementDescriptors.length > 0 && exprResult && typeof exprResult === 'object') {
          const mergedDescriptor = elementDescriptors.length === 1
            ? elementDescriptors[0]
            : mergeDescriptors(...elementDescriptors);
          if (mergedDescriptor.labels.length > 0 || mergedDescriptor.taint.length > 0 || mergedDescriptor.sources.length > 0) {
            setExpressionProvenance(exprResult, mergedDescriptor);
          }
        }
      }
      childEnv.popExecutionContext('exe');
      childEnv.popExecutionContext('for');
      return exprResult as any;
    } catch (error) {
      childEnv.popExecutionContext('exe');
      childEnv.popExecutionContext('for');
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
