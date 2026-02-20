import type { GuardDefinition } from '../guards';
import type { HookableNode } from '@core/types/hooks';
import { isEffectHookTarget, isExecHookTarget } from '@core/types/hooks';

export type GuardOverrideValue = false | { only?: unknown; except?: unknown } | undefined;

export interface NormalizedGuardOverride {
  kind: 'none' | 'disableAll' | 'only' | 'except';
  names?: Set<string>;
}

export function extractGuardOverride(node: HookableNode): GuardOverrideValue {
  const withClause = resolveWithClause(node);
  if (withClause && typeof withClause === 'object' && 'guards' in withClause) {
    return (withClause as any).guards as GuardOverrideValue;
  }
  return undefined;
}

export function resolveWithClause(node: HookableNode): unknown {
  if (isExecHookTarget(node)) {
    return (node as any).withClause;
  }
  if (isEffectHookTarget(node)) {
    return (node as any).meta?.withClause;
  }
  if ((node as any).withClause) {
    return (node as any).withClause;
  }
  const values = (node as any).values;
  if (values?.withClause) {
    return values.withClause;
  }
  if (values?.value?.withClause) {
    return values.value.withClause;
  }
  if (values?.invocation?.withClause) {
    return values.invocation.withClause;
  }
  if (values?.execInvocation?.withClause) {
    return values.execInvocation.withClause;
  }
  if (values?.execRef?.withClause) {
    return values.execRef.withClause;
  }
  const metaWithClause = (node as any).meta?.withClause;
  if (metaWithClause) {
    return metaWithClause;
  }
  return undefined;
}

export function normalizeGuardNames(
  names: unknown,
  field: 'only' | 'except'
): Set<string> {
  if (!Array.isArray(names)) {
    throw new Error(`Guard override ${field} value must be an array`);
  }
  const normalized = new Set<string>();
  for (const entry of names) {
    if (typeof entry !== 'string') {
      throw new Error(`Guard override ${field} entries must be strings starting with @`);
    }
    const trimmed = entry.trim();
    if (!trimmed.startsWith('@')) {
      throw new Error(`Guard override ${field} entries must start with @`);
    }
    const name = trimmed.slice(1);
    if (!name) {
      throw new Error(`Guard override ${field} entries must include a name after @`);
    }
    normalized.add(name);
  }
  return normalized;
}

export function normalizeGuardOverride(raw: GuardOverrideValue): NormalizedGuardOverride {
  if (raw === undefined) {
    return { kind: 'none' };
  }
  if (raw === false) {
    return { kind: 'disableAll' };
  }
  if (raw && typeof raw === 'object') {
    const rawOnly = (raw as any).only;
    const rawExcept = (raw as any).except;
    const hasOnly = Array.isArray(rawOnly);
    const hasExcept = Array.isArray(rawExcept);
    const hasOnlyValue = rawOnly !== undefined;
    const hasExceptValue = rawExcept !== undefined;

    if (hasOnly && hasExcept) {
      throw new Error('Guard override cannot specify both only and except');
    }
    if (hasOnlyValue && !hasOnly) {
      throw new Error('Guard override only value must be an array');
    }
    if (hasExceptValue && !hasExcept) {
      throw new Error('Guard override except value must be an array');
    }
    if (hasOnly) {
      return { kind: 'only', names: normalizeGuardNames(rawOnly, 'only') };
    }
    if (hasExcept) {
      return { kind: 'except', names: normalizeGuardNames(rawExcept, 'except') };
    }
    return { kind: 'none' };
  }
  throw new Error('Guard override must be false or an object');
}

export function applyGuardOverrideFilter(
  guards: GuardDefinition[],
  override: NormalizedGuardOverride
): GuardDefinition[] {
  if (override.kind === 'disableAll') {
    return guards.filter(def => def.privileged === true);
  }
  if (override.kind === 'only') {
    return guards.filter(def => def.privileged === true || (def.name && override.names?.has(def.name)));
  }
  if (override.kind === 'except') {
    return guards.filter(def => def.privileged === true || !def.name || !override.names?.has(def.name));
  }
  return guards;
}
