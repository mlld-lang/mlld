import type { LoopDirective, LoopExpression, LoopLimitValue } from '@core/types';
import type { HookableNode } from '@core/types/hooks';
import { MlldDirectiveError } from '@core/errors';
import { evaluate, type EvalResult } from '../core/interpreter';
import type { Environment } from '../env/Environment';
import type { OperationContext } from '../env/ContextManager';
import { createStructuredValueVariable, type VariableSource } from '@core/types/variable';
import { asData, isStructuredValue, wrapStructured, type StructuredValue } from '../utils/structured-value';
import { resolveControlValue } from './control-flow';
import { evaluateCondition } from './when';
import { evaluateWhenExpression } from './when-expression';
import { isAugmentedAssignment, isLetAssignment } from '@core/types/when';
import { evaluateAugmentedAssignment, evaluateLetAssignment } from './when';
import { isExeReturnControl } from './exe-return';
import { getGuardTransformedInputs, handleGuardDecision } from '@interpreter/hooks/hook-decision-handler';
import { runUserAfterHooks, runUserBeforeHooks } from '@interpreter/hooks/user-hook-runner';

interface LoopContextSnapshot {
  iteration: number;
  limit: number | null;
  active: boolean;
}

type LoopIterationResult =
  | { status: 'done'; value: unknown }
  | { status: 'continue'; value: StructuredValue }
  | { status: 'until' }
  | { status: 'exeReturn'; value: unknown };

type LoopNode = LoopDirective | LoopExpression;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeState(value: unknown): StructuredValue {
  if (isStructuredValue(value)) {
    return value;
  }

  // Handle null/undefined explicitly to avoid JSON.stringify quirks
  if (value === null) {
    return wrapStructured(null as any, 'null' as any, 'null');
  }
  if (value === undefined) {
    return wrapStructured('', 'text', '');
  }

  const textValue = typeof value === 'string' ? value : JSON.stringify(value);
  const kind: StructuredValue['type'] =
    Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : 'text';
  return wrapStructured(value as any, kind, textValue);
}

async function setLoopInputVariable(env: Environment, value: StructuredValue): Promise<void> {
  const source: VariableSource = {
    directive: 'var',
    syntax: 'template',
    hasInterpolation: false,
    isMultiLine: false
  };
  const inputVar = createStructuredValueVariable('input', value, source, {
    internal: { isSystem: true, isLoopInput: true }
  });
  env.setVariable('input', inputVar);
}

function toHookNode(node: LoopNode): HookableNode {
  return node as unknown as HookableNode;
}

function buildLoopIterationOperationContext(
  node: LoopNode,
  iteration: number,
  limit: number | null
): OperationContext {
  return {
    type: 'loop',
    subtype: 'loop',
    name: 'loop',
    location: node.location ?? null,
    metadata: {
      iteration,
      limit,
      active: true
    }
  };
}

async function runLoopIterationBoundary<T>(
  options: {
    env: Environment;
    node: LoopNode;
    operationContext: OperationContext;
    inputs: readonly unknown[];
    execute: (resolvedInputs: readonly unknown[]) => Promise<T>;
  }
): Promise<T> {
  const { env, node, operationContext, inputs, execute } = options;
  const hookNode = toHookNode(node);
  const hookManager = env.getHookManager();

  return env.withOpContext(operationContext, async () => {
    const hookEnv = env.createChild();
    const userHookInputs = await runUserBeforeHooks(hookNode, inputs, hookEnv, operationContext);
    const preDecision = await hookManager.runPre(hookNode, userHookInputs, hookEnv, operationContext);
    const resolvedInputs = getGuardTransformedInputs(preDecision, userHookInputs) ?? userHookInputs;
    await handleGuardDecision(preDecision, hookNode, hookEnv, operationContext);

    const value = await execute(resolvedInputs);
    let result: EvalResult = { value, env };
    result = await hookManager.runPost(hookNode, result, resolvedInputs, hookEnv, operationContext);
    result = await runUserAfterHooks(hookNode, result, resolvedInputs, hookEnv, operationContext);
    return result.value as T;
  });
}

export function isControlCandidate(result: unknown): boolean {
  const unwrapped = isStructuredValue(result) ? asData(result) : result;
  if (unwrapped && typeof unwrapped === 'object' && '__whileControl' in (unwrapped as Record<string, unknown>)) {
    return true;
  }
  if (unwrapped && typeof unwrapped === 'object' && 'valueType' in (unwrapped as Record<string, unknown>)) {
    const valueType = (unwrapped as any).valueType;
    return valueType === 'done' || valueType === 'continue' || valueType === 'retry';
  }
  return unwrapped === 'done' || unwrapped === 'continue' || unwrapped === 'retry';
}

function validateLoopLimit(limit: number, sourceLocation?: any): number {
  if (!Number.isFinite(limit) || Number.isNaN(limit) || limit < 0 || !Number.isInteger(limit)) {
    throw new MlldDirectiveError(
      'loop limit expects a non-negative whole number.',
      'loop',
      { location: sourceLocation, context: { limit } }
    );
  }
  return limit;
}

async function resolveLoopLimit(
  rawLimit: LoopLimitValue | null | undefined,
  env: Environment,
  sourceLocation?: any
): Promise<number | null> {
  if (rawLimit === null || rawLimit === undefined || rawLimit === 'endless') {
    return null;
  }

  if (typeof rawLimit === 'number') {
    return validateLoopLimit(rawLimit, sourceLocation);
  }

  if (rawLimit && typeof rawLimit === 'object') {
    const resolved = await evaluate(rawLimit as any, env, { isExpression: true });
    let value = resolved.value;
    if (isStructuredValue(value)) {
      value = asData(value);
    }
    if (value === 'endless') {
      return null;
    }
    if (typeof value === 'number') {
      return validateLoopLimit(value, sourceLocation);
    }
    throw new MlldDirectiveError(
      'loop limit expects a number.',
      'loop',
      { location: sourceLocation, context: { value } }
    );
  }

  throw new MlldDirectiveError(
    'loop limit expects a number.',
    'loop',
    { location: sourceLocation, context: { value: rawLimit } }
  );
}

async function runLoop(
  env: Environment,
  options: {
    node: LoopNode;
    limit?: LoopLimitValue | null;
    rateMs?: number | null;
    until?: any[] | null;
    block: any[];
  }
): Promise<unknown> {
  const resolvedLimit = await resolveLoopLimit(options.limit, env, options.node.location ?? undefined);
  const rateMs = options.rateMs ?? null;
  const until = Array.isArray(options.until) && options.until.length > 0 ? options.until : null;
  const statements = Array.isArray(options.block) ? options.block : [];

  if (rateMs !== null && rateMs < 0) {
    throw new MlldDirectiveError(
      'loop pacing expects a positive duration.',
      'loop',
      { location: options.node.location ?? undefined, context: { rateMs } }
    );
  }

  let state = normalizeState(null);

  for (let iteration = 1; ; iteration++) {
    if (resolvedLimit !== null && iteration > resolvedLimit) {
      return null;
    }

    const loopCtx: LoopContextSnapshot = {
      iteration,
      limit: resolvedLimit,
      active: true
    };

    const iterEnv = env.createChildEnvironment();
    const iterationOperationContext = buildLoopIterationOperationContext(
      options.node,
      iteration,
      resolvedLimit
    );

    const iterationResult = await iterEnv.withExecutionContext('loop', loopCtx, async (): Promise<LoopIterationResult> => {
      return runLoopIterationBoundary({
        env: iterEnv,
        node: options.node,
        operationContext: iterationOperationContext,
        inputs: [state],
        execute: async (resolvedInputs): Promise<LoopIterationResult> => {
          const iterationInput =
            resolvedInputs.length > 0 ? normalizeState(resolvedInputs[0]) : state;
          await setLoopInputVariable(iterEnv, iterationInput);

          if (until) {
            const shouldStop = await evaluateCondition(until, iterEnv);
            if (shouldStop) {
              return { status: 'until' };
            }
          }

          let blockEnv = iterEnv;

          for (const stmt of statements) {
            if (isLetAssignment(stmt)) {
              blockEnv = await evaluateLetAssignment(stmt, blockEnv);
              continue;
            }
            if (isAugmentedAssignment(stmt)) {
              blockEnv = await evaluateAugmentedAssignment(stmt, blockEnv);
              continue;
            }

            let result: EvalResult;
            if (stmt.type === 'WhenExpression' && stmt.meta?.modifier !== 'first') {
              const nodeWithFirst = {
                ...stmt,
                meta: { ...(stmt.meta || {}), modifier: 'first' as const }
              };
              result = await evaluateWhenExpression(nodeWithFirst as any, blockEnv);
            } else {
              result = await evaluate(stmt, blockEnv);
            }

            blockEnv = result.env || blockEnv;

            if (isExeReturnControl(result.value)) {
              return { status: 'exeReturn', value: result.value };
            }

            if (isControlCandidate(result.value)) {
              const control = await resolveControlValue(result.value, blockEnv, iterationInput, {
                defaultBehavior: 'keep',
                retryMessage: "Use 'continue' instead of 'retry' in loop bodies",
                doneDefault: 'null'
              });
              if (control.kind === 'done') {
                return { status: 'done', value: control.value };
              }
              const nextState = normalizeState(control.value);
              return { status: 'continue', value: nextState };
            }
          }

          return { status: 'continue', value: iterationInput };
        }
      });
    });

    if (iterationResult.status === 'until') {
      return null;
    }
    if (iterationResult.status === 'exeReturn') {
      return iterationResult.value;
    }
    if (iterationResult.status === 'done') {
      return iterationResult.value ?? null;
    }

    state = iterationResult.value;

    if (rateMs && (resolvedLimit === null || iteration < resolvedLimit)) {
      await sleep(rateMs);
    }
  }
}

export async function evaluateLoopDirective(
  directive: LoopDirective,
  env: Environment
): Promise<EvalResult> {
  env.pushDirective('/loop', 'loop', directive.location);

  try {
    const value = await runLoop(env, {
      node: directive,
      limit: directive.values?.limit ?? null,
      rateMs: directive.values?.rateMs ?? null,
      until: directive.values?.until ?? null,
      block: directive.values?.block ?? []
    });
    return { value, env };
  } finally {
    env.popDirective();
  }
}

export async function evaluateLoopExpression(
  expr: LoopExpression,
  env: Environment
): Promise<unknown> {
  return runLoop(env, {
    node: expr,
    limit: expr.limit ?? null,
    rateMs: expr.rateMs ?? null,
    until: expr.until ?? null,
    block: expr.block ?? []
  });
}
