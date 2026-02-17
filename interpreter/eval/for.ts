import type {
  ForDirective,
  ForExpression,
  Environment,
  ArrayVariable,
  BaseMlldNode
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
import { isBailError } from '@core/errors';
import { isConditionPair } from '@core/types/when';
import { evaluateCondition } from './when';

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

type ForTask = {
  entry: [any, any];
  index: number;
};

function isLiteralValueType(node: unknown, valueType: string): boolean {
  return (
    !!node &&
    typeof node === 'object' &&
    (node as any).type === 'Literal' &&
    (node as any).valueType === valueType
  );
}

function isSkipLiteralAction(action: unknown): boolean {
  if (!Array.isArray(action) || action.length !== 1) {
    return false;
  }
  return isLiteralValueType(action[0], 'skip');
}

function getDirectiveWhenFilterCondition(directive: ForDirective): BaseMlldNode[] | null {
  if (directive.meta?.actionType !== 'single' || directive.values.action.length !== 1) {
    return null;
  }

  const action = directive.values.action[0] as any;
  if (!action || action.type !== 'WhenExpression' || !Array.isArray(action.conditions)) {
    return null;
  }
  if (action.conditions.length !== 1) {
    return null;
  }

  const first = action.conditions[0];
  if (!isConditionPair(first) || !Array.isArray(first.condition) || first.condition.length === 0) {
    return null;
  }
  if (first.condition.length === 1) {
    const single = first.condition[0];
    if (isLiteralValueType(single, 'none') || isLiteralValueType(single, 'wildcard')) {
      return null;
    }
  }

  return first.condition as BaseMlldNode[];
}

function getExpressionWhenFilterNode(expr: ForExpression): any | null {
  if (!Array.isArray(expr.expression) || expr.expression.length !== 1) {
    return null;
  }

  const action = expr.expression[0] as any;
  if (!action || action.type !== 'WhenExpression' || !Array.isArray(action.conditions)) {
    return null;
  }

  const hasNoneSkip = action.conditions.some((entry: unknown) => {
    if (!isConditionPair(entry as any) || !Array.isArray((entry as any).condition)) {
      return false;
    }
    const condition = (entry as any).condition;
    return condition.length === 1 && isLiteralValueType(condition[0], 'none') && isSkipLiteralAction((entry as any).action);
  });

  return hasNoneSkip ? action : null;
}

async function evaluateWhenFilterMatch(whenExpr: any, env: Environment): Promise<boolean> {
  if (!whenExpr || !Array.isArray(whenExpr.conditions)) {
    return true;
  }

  for (const entry of whenExpr.conditions) {
    if (!isConditionPair(entry) || !Array.isArray(entry.condition) || entry.condition.length === 0) {
      continue;
    }

    if (entry.condition.length === 1) {
      const single = entry.condition[0];
      if (isLiteralValueType(single, 'none')) {
        return false;
      }
      if (isLiteralValueType(single, 'wildcard')) {
        return true;
      }
    }

    const matched = await evaluateCondition(entry.condition, env);
    if (matched) {
      return true;
    }
  }

  return false;
}

async function findCanaryTask(
  tasks: ForTask[],
  qualifies?: (task: ForTask) => Promise<boolean>
): Promise<ForTask | null> {
  if (tasks.length === 0) {
    return null;
  }
  if (!qualifies) {
    return tasks[0];
  }

  for (const task of tasks) {
    if (await qualifies(task)) {
      return task;
    }
  }

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
    const { iterable, sourceDescriptor } = await evaluateForDirectiveSource(directive, env);
    const sourceKind = iterable.__mlldForSourceKind;

    // Determine parallel options (directive-specified or inherited from parent scope)
    const specified = (directive.values as any).forOptions as ForParallelOptions | undefined;
    const inherited = (env as any).__forOptions as ForParallelOptions | undefined;
    const effective = await resolveParallelOptions(specified ?? inherited, env, directive.location);

    const iterableArray = Array.from(iterable);
    const tasks: ForTask[] = iterableArray.map((entry, index) => ({
      entry: entry as [any, any],
      index
    }));
    const forErrors = effective?.parallel ? ([] as ForIterationError[]) : null;
    if (forErrors) {
      publishForErrorsContext(env, forErrors);
    }
    const whenFilterCondition = getDirectiveWhenFilterCondition(directive);

    const runOne = async (
      entry: [any, any],
      idx: number,
      options?: { failFast?: boolean }
    ) => {
      const setup = await setupIterationContext({
        rootEnv: env,
        entry,
        index: idx,
        total: iterableArray.length,
        effective,
        sourceKind,
        varName,
        keyVarName,
        varFields,
        fieldPathString,
        sourceLocation: varNode.location,
        sourceDescriptor
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
        if (isBailError(err)) {
          throw err;
        }
        if (forErrors && !options?.failFast) {
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
      const canaryTask = await findCanaryTask(tasks, whenFilterCondition
        ? async (task: ForTask) => {
            const setup = await setupIterationContext({
              rootEnv: env,
              entry: task.entry,
              index: task.index,
              total: iterableArray.length,
              effective,
              sourceKind,
              varName,
              keyVarName,
              varFields,
              fieldPathString,
              sourceLocation: varNode.location,
              sourceDescriptor
            });
            const childEnv = setup.childEnv;
            try {
              return await evaluateCondition(whenFilterCondition, childEnv);
            } finally {
              popForIterationContext(childEnv);
            }
          }
        : undefined);

      if (canaryTask) {
        const canaryResult = await runOne(canaryTask.entry, canaryTask.index, { failFast: true });
        if (isExeReturnControl(canaryResult)) {
          return { value: canaryResult, env };
        }
      }

      const remainingTasks = canaryTask
        ? tasks.filter(task => task.index !== canaryTask.index)
        : (whenFilterCondition ? [] : tasks);

      const cap = Math.min(effective.cap ?? getParallelLimit(), remainingTasks.length);
      const results = await runWithConcurrency(
        remainingTasks,
        cap,
        task => runOne(task.entry, task.index),
        { ordered: false, paceMs: effective.rateMs }
      );
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
  const sourceKind = iterable.__mlldForSourceKind;

  const results: unknown[] = [];
  const errors: ForIterationError[] = [];

  const specified = (expr.meta as any)?.forOptions as ForParallelOptions | undefined;
  const inherited = (env as any).__forOptions as ForParallelOptions | undefined;
  const effective = await resolveParallelOptions(specified ?? inherited, env, expr.location);
  if (effective?.parallel) {
    publishForErrorsContext(env, errors);
  }

  const iterableArray = Array.from(iterable);
  const tasks: ForTask[] = iterableArray.map((entry, index) => ({
    entry: entry as [any, any],
    index
  }));
  const expressionWhenFilter = getExpressionWhenFilterNode(expr);

  const SKIP = Symbol('skip');
  const DONE = Symbol('done');
  const runOne = async (
    entry: [any, any],
    idx: number,
    options?: { failFast?: boolean }
  ) => {
    const setup = await setupIterationContext({
      rootEnv: env,
      entry,
      index: idx,
      total: iterableArray.length,
      effective,
      sourceKind,
      varName,
      keyVarName,
      varFields,
      fieldPathString,
      sourceLocation: expr.variable.location,
      sourceDescriptor
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
      if (isBailError(error)) {
        throw error;
      }
      if (!effective?.parallel || options?.failFast) {
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
    const canaryTask = await findCanaryTask(tasks, expressionWhenFilter
      ? async (task: ForTask) => {
          const setup = await setupIterationContext({
            rootEnv: env,
            entry: task.entry,
            index: task.index,
            total: iterableArray.length,
            effective,
            sourceKind,
            varName,
            keyVarName,
            varFields,
            fieldPathString,
            sourceLocation: expr.variable.location,
            sourceDescriptor
          });
          const childEnv = setup.childEnv;
          try {
            return await evaluateWhenFilterMatch(expressionWhenFilter, childEnv);
          } finally {
            popForIterationContext(childEnv);
          }
        }
      : undefined);

    const orderedResults: unknown[] = new Array(iterableArray.length).fill(SKIP);

    if (canaryTask) {
      orderedResults[canaryTask.index] = await runOne(
        canaryTask.entry,
        canaryTask.index,
        { failFast: true }
      );
    }

    const remainingTasks = canaryTask
      ? tasks.filter(task => task.index !== canaryTask.index)
      : (expressionWhenFilter ? [] : tasks);
    const cap = Math.min(effective.cap ?? getParallelLimit(), remainingTasks.length);
    const parallelResults = await runWithConcurrency(
      remainingTasks,
      cap,
      async task => ({
        index: task.index,
        value: await runOne(task.entry, task.index)
      }),
      { ordered: false, paceMs: effective.rateMs }
    );
    for (const item of parallelResults) {
      orderedResults[item.index] = item.value;
    }
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
