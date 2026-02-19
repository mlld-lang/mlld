import type { HookTiming, HookBodyNode } from '@core/types/hook';
import type { HookableNode } from '@core/types/hooks';
import { isExecHookTarget } from '@core/types/hooks';
import type { EvalResult } from '../core/interpreter';
import { evaluate } from '../core/interpreter';
import type { OperationContext } from '../env/ContextManager';
import type { Environment } from '../env/Environment';
import { evaluateWhenExpression } from '../eval/when-expression';
import { VariableImporter } from '../eval/import/VariableImporter';
import type { HookDefinition } from './HookRegistry';

interface UserHookRunOptions {
  timing: HookTiming;
  node: HookableNode;
  env: Environment;
  operation?: OperationContext;
  inputs: readonly unknown[];
  result?: EvalResult;
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

function collectMatchingUserHooks(
  timing: HookTiming,
  node: HookableNode,
  env: Environment,
  operation?: OperationContext
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
    addUniqueHooks(matches, registry.getFunctionHooks(functionName, timing), seen);
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
  inputs: readonly unknown[],
  result?: EvalResult
): Environment {
  const hookEnv = env.createChild();
  const importer = new VariableImporter();
  const inputValue = inputs.length === 1 ? inputs[0] : inputs;
  bindHookVariable(hookEnv, importer, 'input', inputValue);
  if (result !== undefined) {
    bindHookVariable(hookEnv, importer, 'output', result.value);
  }
  return hookEnv;
}

async function executeHookBody(body: HookBodyNode, hookEnv: Environment): Promise<void> {
  if (body.type === 'WhenExpression') {
    await evaluateWhenExpression(body as any, hookEnv);
    return;
  }

  if (body.type === 'HookBlock') {
    for (const statement of body.statements ?? []) {
      await evaluate(statement as any, hookEnv);
    }
    return;
  }
}

async function runUserHooks(options: UserHookRunOptions): Promise<EvalResult | undefined> {
  const { timing, node, env, operation, inputs, result } = options;
  const matches = collectMatchingUserHooks(timing, node, env, operation);
  if (matches.length === 0) {
    return result;
  }

  for (const hook of matches) {
    const hookEnv = createHookEnvironment(env, inputs, result);
    await executeHookBody(hook.body, hookEnv);
  }

  return result;
}

export async function runUserBeforeHooks(
  node: HookableNode,
  inputs: readonly unknown[],
  env: Environment,
  operation?: OperationContext
): Promise<void> {
  await runUserHooks({
    timing: 'before',
    node,
    env,
    operation,
    inputs
  });
}

export async function runUserAfterHooks(
  node: HookableNode,
  result: EvalResult,
  inputs: readonly unknown[],
  env: Environment,
  operation?: OperationContext
): Promise<EvalResult> {
  return (
    (await runUserHooks({
      timing: 'after',
      node,
      env,
      operation,
      inputs,
      result
    })) ?? result
  );
}
