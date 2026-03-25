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

export async function resolveValueHandles(value: unknown, env: Environment): Promise<unknown> {
  if (isHandleWrapper(value)) {
    return env.resolveHandle(value.handle);
  }

  if (isVariable(value)) {
    const resolvedValue = await resolveValueHandles(value.value, env);
    if (resolvedValue === value.value) {
      return value;
    }
    return {
      ...value,
      value: resolvedValue
    };
  }

  if (isStructuredValue(value)) {
    if (value.type !== 'object' && value.type !== 'array') {
      return value;
    }
    const resolvedData = await resolveValueHandles(value.data, env);
    return wrapStructured(
      resolvedData as any,
      value.type,
      undefined,
      value.metadata
    );
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
