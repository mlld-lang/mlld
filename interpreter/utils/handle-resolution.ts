import { isHandleWrapper } from '@core/types/handle';
import type { Environment } from '@interpreter/env/Environment';
import {
  isStructuredValue,
  wrapStructured
} from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneWithOwnDescriptors<T extends object>(value: T): T {
  const clone = Object.create(Object.getPrototypeOf(value));
  Object.defineProperties(clone, Object.getOwnPropertyDescriptors(value));
  return clone;
}

export async function resolveValueHandles(value: unknown, env: Environment): Promise<unknown> {
  if (isHandleWrapper(value)) {
    return env.resolveHandle(value.handle);
  }

  if (isVariable(value)) {
    const resolvedValue = await resolveValueHandles(value.value, env);
    if (resolvedValue === value.value) {
      return value;
    }
    const clone = cloneWithOwnDescriptors(value);
    (clone as typeof value).value = resolvedValue;
    return clone;
  }

  if (isStructuredValue(value)) {
    if (value.type !== 'object' && value.type !== 'array') {
      return value;
    }
    const resolvedData = await resolveValueHandles(value.data, env);
    if (resolvedData === value.data) {
      return value;
    }
    const resolved = wrapStructured(
      resolvedData as any,
      value.type,
      value.text,
      value.metadata
    );
    if (value.internal) {
      resolved.internal = { ...value.internal };
    }
    return resolved;
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map(item => resolveValueHandles(item, env)));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = await resolveValueHandles(entry, env);
    }
    return result;
  }

  return value;
}
