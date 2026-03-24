import type { Variable } from '@core/types/variable';
import { isVariable } from './variable-resolution';
import {
  cloneVariableForGuard,
  hasSecretLabel,
  redactVariableForErrorOutput
} from '../hooks/guard-materialization';

export const GUARD_ARG_NAMES_METADATA_KEY = 'guardArgNames';

export type GuardArgName = string | null | undefined;

export interface GuardArgsSnapshot {
  names: readonly string[];
  values: Readonly<Record<string, Variable>>;
}

const GUARD_ARGS_META = Symbol('mlld.guardArgsMeta');

type GuardArgsAccessMode = 'field' | 'bracket';

type GuardArgsView = Record<string, unknown> & {
  names: readonly string[];
  [GUARD_ARGS_META]?: GuardArgsSnapshot;
};

function normalizeGuardArgName(name: GuardArgName): string | null {
  if (typeof name !== 'string') {
    return null;
  }
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildGuardArgsSnapshot(
  inputs: readonly Variable[],
  argNames?: readonly GuardArgName[]
): GuardArgsSnapshot | undefined {
  if (!Array.isArray(argNames) || argNames.length === 0 || inputs.length === 0) {
    return undefined;
  }

  const values = Object.create(null) as Record<string, Variable>;
  const names: string[] = [];
  const limit = Math.min(inputs.length, argNames.length);

  for (let index = 0; index < limit; index += 1) {
    const variable = inputs[index];
    const name = normalizeGuardArgName(argNames[index]);
    if (!variable || !name) {
      continue;
    }
    if (!(name in values)) {
      names.push(name);
    }
    values[name] = variable;
  }

  if (names.length === 0) {
    return undefined;
  }

  return {
    names: Object.freeze(names.slice()),
    values: Object.freeze(values)
  };
}

export function cloneGuardArgsSnapshot(
  snapshot?: GuardArgsSnapshot
): GuardArgsSnapshot | undefined {
  if (!snapshot || snapshot.names.length === 0) {
    return undefined;
  }

  const values = Object.create(null) as Record<string, Variable>;

  for (const name of snapshot.names) {
    const value = snapshot.values[name];
    if (!value || !isVariable(value)) {
      continue;
    }

    if (hasSecretLabel(value)) {
      const redacted = cloneVariableForGuard(value);
      redacted.value = redactVariableForErrorOutput(value);
      values[name] = redacted;
      continue;
    }

    values[name] = cloneVariableForGuard(value);
  }

  return {
    names: Object.freeze(snapshot.names.slice()),
    values: Object.freeze(values)
  };
}

export function createGuardArgsView(snapshot?: GuardArgsSnapshot): Record<string, unknown> {
  const view = Object.create(null) as GuardArgsView;
  const names = snapshot?.names ? Object.freeze(snapshot.names.slice()) : Object.freeze([] as string[]);

  Object.defineProperty(view, GUARD_ARGS_META, {
    value: snapshot,
    enumerable: false,
    configurable: true,
    writable: false
  });

  Object.defineProperty(view, 'names', {
    value: names,
    enumerable: true,
    configurable: true,
    writable: false
  });

  if (!snapshot) {
    return view;
  }

  for (const name of snapshot.names) {
    if (name === 'names') {
      continue;
    }
    const value = snapshot.values[name];
    Object.defineProperty(view, name, {
      value,
      enumerable: true,
      configurable: true,
      writable: false
    });
  }

  return view;
}

export function isGuardArgsView(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Object.prototype.hasOwnProperty.call(value as object, GUARD_ARGS_META)
  );
}

export function resolveGuardArgsViewProperty(
  value: unknown,
  key: string,
  mode: GuardArgsAccessMode
): { found: boolean; value?: unknown } {
  if (!isGuardArgsView(value)) {
    return { found: false };
  }

  const snapshot = (value as GuardArgsView)[GUARD_ARGS_META];
  if (!snapshot) {
    if (mode === 'field' && key === 'names') {
      return { found: true, value: (value as GuardArgsView).names };
    }
    return { found: false };
  }

  if (mode === 'field' && key === 'names') {
    return { found: true, value: (value as GuardArgsView).names };
  }

  if (Object.prototype.hasOwnProperty.call(snapshot.values, key)) {
    return { found: true, value: snapshot.values[key] };
  }

  return { found: false };
}

export function getGuardArgNamesFromMetadata(
  metadata?: Readonly<Record<string, unknown>> | null
): readonly GuardArgName[] | undefined {
  const candidate = metadata?.[GUARD_ARG_NAMES_METADATA_KEY];
  if (!Array.isArray(candidate)) {
    return undefined;
  }
  return candidate.map(entry => normalizeGuardArgName(entry));
}

export function mergeGuardArgNamesIntoMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  argNames?: readonly GuardArgName[]
): Readonly<Record<string, unknown>> | undefined {
  if (!Array.isArray(argNames) || argNames.length === 0) {
    return metadata;
  }

  const normalized = argNames.map(entry => normalizeGuardArgName(entry));
  if (!normalized.some(Boolean)) {
    return metadata;
  }

  return {
    ...(metadata ?? {}),
    [GUARD_ARG_NAMES_METADATA_KEY]: normalized
  };
}
