import type {
  ForDirective,
  ForExpression,
  Environment,
  ArrayVariable
} from '@core/types';
import type { EvalResult } from '../core/interpreter';
import { getParallelLimit, runWithConcurrency } from '@interpreter/utils/parallel';
import {
  asData,
  isStructuredValue
} from '../utils/structured-value';
import { isExeReturnControl } from './exe-return';
import { resolveParallelOptions, type ForParallelOptions } from './for/parallel-options';
import { executeDirectiveActions } from './for/directive-action-runner';
import { evaluateForExpressionIteration } from './for/expression-runner';
import { applyForExpressionBatchPipeline } from './for/batch-pipeline';
import {
  createForIterationError,
  publishForErrorsContext,
  recordParallelExpressionIterationError
} from './for/error-reporting';
import {
  evaluateForDirectiveSource,
  evaluateForExpressionSource
} from './for/source-evaluator';
import { createForExpressionResultVariable } from './for/result-variable';
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
import type {
  ForControlKindResolver,
  ForIterationError
} from './for/types';

function extractControlKind(value: unknown): ReturnType<ForControlKindResolver> {
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

  // Trace support
  env.pushDirective('/for', `@${varName} in ...`, directive.location);

  try {
    const iterable = await evaluateForDirectiveSource(directive, env);

    // Determine parallel options (directive-specified or inherited from parent scope)
    const specified = (directive.values as any).forOptions as ForParallelOptions | undefined;
    const inherited = (env as any).__forOptions as ForParallelOptions | undefined;
    const effective = await resolveParallelOptions(specified ?? inherited, env, directive.location);

    const iterableArray = Array.from(iterable);
    const forErrors = effective?.parallel ? ([] as ForIterationError[]) : null;
    if (forErrors) {
      publishForErrorsContext(env, forErrors);
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
          forErrors.push(createForIterationError({
            index: idx,
            key: key ?? null,
            error: err,
            value
          }));
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

  const { iterable, sourceDescriptor } = await evaluateForExpressionSource(expr, env);

  const results: unknown[] = [];
  const errors: ForIterationError[] = [];

  const specified = (expr.meta as any)?.forOptions as ForParallelOptions | undefined;
  const inherited = (env as any).__forOptions as ForParallelOptions | undefined;
  const effective = await resolveParallelOptions(specified ?? inherited, env, expr.location);
  if (effective?.parallel) {
    publishForErrorsContext(env, errors);
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
      const marker = recordParallelExpressionIterationError({
        env,
        errors,
        index: idx,
        key: key ?? null,
        error,
        value,
        sourceLocation: expr.location
      });
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
  return createForExpressionResultVariable({
    expr,
    finalResults: batchPipelineResult.finalResults,
    errors,
    sourceDescriptor,
    hadBatchPipeline: batchPipelineResult.hadBatchPipeline
  });
}
