import type { Environment } from '../env/Environment';
import type { OperationContext } from '../env/ContextManager';
import type { Variable } from '@core/types/variable';
import type { GuardDecisionType, GuardScope } from '@core/types/guard';

export interface GuardAttemptEntry {
  attempt: number;
  decision: GuardDecisionType;
  hint?: string | null;
}

export interface GuardAttemptState {
  nextAttempt: number;
  history: GuardAttemptEntry[];
}

const guardAttemptStores = new WeakMap<Environment, Map<string, GuardAttemptState>>();

export function getRootEnvironment(env: Environment): Environment {
  let current: Environment | undefined = env;
  while (current.getParent()) {
    current = current.getParent();
  }
  return current!;
}

export function getAttemptStore(env: Environment): Map<string, GuardAttemptState> {
  const root = getRootEnvironment(env);
  let store = guardAttemptStores.get(root);
  if (!store) {
    store = new Map();
    guardAttemptStores.set(root, store);
  }
  return store;
}

function buildVariableIdentity(variable?: Variable): string {
  if (!variable) {
    return 'operation';
  }
  const definedAt = variable.mx?.definedAt;
  const location =
    definedAt && typeof definedAt === 'object'
      ? `${definedAt.filePath ?? ''}:${definedAt.line ?? ''}:${definedAt.column ?? ''}`
      : '';
  return `${variable.name ?? 'input'}::${location}`;
}

function buildOperationIdentity(operation: OperationContext): string {
  const trace = (operation.metadata?.trace as string | undefined) ?? '';
  return `${trace}:${operation.type}:${operation.name ?? ''}`;
}

export function buildGuardAttemptKey(
  operation: OperationContext,
  scope: GuardScope,
  variable?: Variable
): string {
  return `${buildOperationIdentity(operation)}::${scope}::${buildVariableIdentity(variable)}`;
}

export function clearGuardAttemptState(store: Map<string, GuardAttemptState>, key: string): void {
  store.delete(key);
}

export function clearGuardAttemptStates(
  store: Map<string, GuardAttemptState>,
  keys: Iterable<string>
): void {
  for (const key of keys) {
    clearGuardAttemptState(store, key);
  }
}
