import type { HookBodyNode, HookFilterKind, HookTiming } from '@core/types/hook';
import type { HookableNode } from '@core/types/hooks';
import { isExecHookTarget } from '@core/types/hooks';
import type { EvalResult } from '../core/interpreter';
import { evaluate } from '../core/interpreter';
import type { OperationContext } from '../env/ContextManager';
import type { Environment } from '../env/Environment';
import { evaluateWhenExpression } from '../eval/when-expression';
import { VariableImporter } from '../eval/import/VariableImporter';
import { asText, isStructuredValue } from '../utils/structured-value';
import { isVariable } from '../utils/variable-resolution';
import type { HookDefinition } from './HookRegistry';

interface UserHookRunOptions {
  timing: HookTiming;
  node: HookableNode;
  env: Environment;
  operation?: OperationContext;
  inputs: readonly unknown[];
  result?: EvalResult;
}

interface HookExecutionOutcome {
  transformed: boolean;
  value?: unknown;
}

interface HookExecutionError {
  hookId: string;
  hookName: string | null;
  timing: HookTiming;
  filterKind: HookFilterKind;
  message: string;
}

const USER_HOOK_ERRORS_METADATA_KEY = 'userHookErrors';

function ensureOperationHookErrorBucket(operation?: OperationContext): HookExecutionError[] {
  if (!operation) {
    return [];
  }

  const operationRef = operation as OperationContext & {
    metadata?: Record<string, unknown>;
  };
  if (!operationRef.metadata || typeof operationRef.metadata !== 'object') {
    operationRef.metadata = {};
  }

  const metadata = operationRef.metadata as Record<string, unknown>;
  const existing = metadata[USER_HOOK_ERRORS_METADATA_KEY];
  if (Array.isArray(existing)) {
    return existing as HookExecutionError[];
  }

  const created: HookExecutionError[] = [];
  metadata[USER_HOOK_ERRORS_METADATA_KEY] = created;
  return created;
}

function addUniqueHooks(
  target: HookDefinition[],
  source: readonly HookDefinition[],
  seen: Set<string>
): void {
  for (const hook of source) {
    if (seen.has(hook.id)) {
      continue;
    }
    seen.add(hook.id);
    target.push(hook);
  }
}

function resolveFunctionName(node: HookableNode, operation?: OperationContext): string | undefined {
  const operationName = operation?.name;
  if (typeof operationName === 'string' && operationName.length > 0) {
    return operationName;
  }

  if (!isExecHookTarget(node)) {
    return undefined;
  }

  const commandRef = (node as any)?.commandRef;
  const identifierNodes = Array.isArray(commandRef?.identifier) ? commandRef.identifier : [];
  const firstIdentifier = identifierNodes[0];
  const identifier =
    firstIdentifier && typeof firstIdentifier === 'object' && typeof firstIdentifier.identifier === 'string'
      ? firstIdentifier.identifier
      : undefined;
  if (identifier && identifier.length > 0) {
    return identifier;
  }

  const commandName =
    commandRef && typeof commandRef === 'object' && typeof commandRef.name === 'string'
      ? commandRef.name
      : undefined;
  return commandName && commandName.length > 0 ? commandName : undefined;
}

function stringifyHookArgument(value: unknown): string {
  const normalized = isVariable(value) ? value.value : value;

  if (isStructuredValue(normalized)) {
    return asText(normalized);
  }

  if (normalized === undefined) {
    return '';
  }

  if (normalized === null) {
    return 'null';
  }

  if (typeof normalized === 'string' || typeof normalized === 'number' || typeof normalized === 'boolean') {
    return String(normalized);
  }

  try {
    return JSON.stringify(normalized);
  } catch {
    return String(normalized);
  }
}

function matchesFunctionArgPattern(hook: HookDefinition, inputs: readonly unknown[]): boolean {
  if (hook.filterKind !== 'function') {
    return true;
  }

  const pattern = typeof hook.argPattern === 'string' ? hook.argPattern : null;
  if (!pattern || pattern.length === 0) {
    return true;
  }

  const firstInput = inputs.length > 0 ? inputs[0] : undefined;
  return stringifyHookArgument(firstInput).startsWith(pattern);
}

function collectMatchingUserHooks(
  timing: HookTiming,
  node: HookableNode,
  env: Environment,
  operation: OperationContext | undefined,
  inputs: readonly unknown[]
): HookDefinition[] {
  const registry = env.getHookRegistry();
  const matches: HookDefinition[] = [];
  const seen = new Set<string>();

  const operationType = operation?.type;
  if (typeof operationType === 'string' && operationType.length > 0) {
    addUniqueHooks(matches, registry.getOperationHooks(operationType, timing), seen);
  }

  const operationLabels = Array.isArray(operation?.labels) ? operation.labels : [];
  for (const label of operationLabels) {
    if (typeof label !== 'string' || label.length === 0) {
      continue;
    }
    addUniqueHooks(matches, registry.getDataHooks(label, timing), seen);
  }

  const functionName = resolveFunctionName(node, operation);
  if (functionName) {
    const functionHooks = registry
      .getFunctionHooks(functionName, timing)
      .filter(hook => matchesFunctionArgPattern(hook, inputs));
    addUniqueHooks(matches, functionHooks, seen);
  }

  return matches.sort((a, b) => a.registrationOrder - b.registrationOrder);
}

function bindHookVariable(
  hookEnv: Environment,
  importer: VariableImporter,
  name: string,
  value: unknown
): void {
  const variable = importer.createVariableFromValue(name, value, 'let', undefined, { env: hookEnv });
  hookEnv.setVariable(name, variable);
}

function createHookEnvironment(
  env: Environment,
  hook: HookDefinition,
  timing: HookTiming,
  inputs: readonly unknown[],
  result?: EvalResult
): Environment {
  const hookEnv = env.createChild();
  const importer = new VariableImporter();
  const shouldExposeInputArray = hook.filterKind === 'function' && timing === 'before';
  const inputValue = shouldExposeInputArray ? Array.from(inputs) : inputs.length === 1 ? inputs[0] : Array.from(inputs);
  bindHookVariable(hookEnv, importer, 'input', inputValue);
  if (result !== undefined) {
    bindHookVariable(hookEnv, importer, 'output', result.value);
  }
  return hookEnv;
}

async function executeHookBody(body: HookBodyNode, hookEnv: Environment): Promise<HookExecutionOutcome> {
  if (body.type === 'WhenExpression') {
    const evaluated = await evaluateWhenExpression(body as any, hookEnv);
    return {
      transformed: true,
      value: evaluated.value
    };
  }

  if (body.type === 'HookBlock') {
    let lastStatementResult: EvalResult | undefined;
    for (const statement of body.statements ?? []) {
      lastStatementResult = await evaluate(statement as any, hookEnv);
    }

    if (body.meta?.hasReturn === true) {
      return {
        transformed: true,
        value: lastStatementResult?.value
      };
    }

    return {
      transformed: false
    };
  }

  const evaluated = await evaluate(body as any, hookEnv);
  return {
    transformed: true,
    value: evaluated.value
  };
}

function applyBeforeHookTransform(_currentInputs: readonly unknown[], value: unknown): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

function applyAfterHookTransform(result: EvalResult, value: unknown): EvalResult {
  const transformed: EvalResult = {
    ...result,
    value
  };
  (transformed as any).__userHookTransformed = true;
  return transformed;
}

function normalizeHookErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function toHookExecutionError(hook: HookDefinition, timing: HookTiming, error: unknown): HookExecutionError {
  return {
    hookId: hook.id,
    hookName: hook.name ?? null,
    timing,
    filterKind: hook.filterKind,
    message: normalizeHookErrorMessage(error)
  };
}

async function runUserHooks(
  options: UserHookRunOptions
): Promise<{ inputs: readonly unknown[]; result?: EvalResult }> {
  const { timing, node, env, operation, inputs, result } = options;
  if (env.shouldSuppressUserHooks()) {
    return {
      inputs,
      result
    };
  }

  const matches = collectMatchingUserHooks(timing, node, env, operation, inputs);
  const hookErrors = ensureOperationHookErrorBucket(operation);
  if (matches.length === 0) {
    return {
      inputs,
      result
    };
  }

  let currentInputs = inputs;
  let currentResult = result;
  return env.withHookSuppression(async () => {
    for (const hook of matches) {
      const hookEnv = createHookEnvironment(env, hook, timing, currentInputs, currentResult);
      try {
        const execution = await executeHookBody(hook.body, hookEnv);
        if (!execution.transformed) {
          continue;
        }

        if (timing === 'before') {
          currentInputs = applyBeforeHookTransform(currentInputs, execution.value);
          continue;
        }

        if (currentResult !== undefined) {
          currentResult = applyAfterHookTransform(currentResult, execution.value);
        }
      } catch (error) {
        hookErrors.push(toHookExecutionError(hook, timing, error));
      }
    }

    return {
      inputs: currentInputs,
      result: currentResult
    };
  });
}

export async function runUserBeforeHooks(
  node: HookableNode,
  inputs: readonly unknown[],
  env: Environment,
  operation?: OperationContext
): Promise<readonly unknown[]> {
  const runResult = await runUserHooks({
    timing: 'before',
    node,
    env,
    operation,
    inputs
  });
  return runResult.inputs;
}

export async function runUserAfterHooks(
  node: HookableNode,
  result: EvalResult,
  inputs: readonly unknown[],
  env: Environment,
  operation?: OperationContext
): Promise<EvalResult> {
  const runResult = await runUserHooks({
    timing: 'after',
    node,
    env,
    operation,
    inputs,
    result
  });
  return runResult.result ?? result;
}
