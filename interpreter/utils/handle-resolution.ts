import { isHandleWrapper } from '@core/types/handle';
import {
  attachToolCollectionMetadata,
  getToolCollectionMetadata
} from '@core/types/tools';
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

function isBareHandleToken(value: string): boolean {
  return /^h_[a-z0-9]+$/.test(value.trim());
}

export function extractProjectedHandleToken(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const handle = value.trim();
    return isBareHandleToken(handle) ? handle : undefined;
  }

  if (!isPlainObject(value) || typeof value.handle !== 'string') {
    return undefined;
  }

  const handle = value.handle.trim();
  if (!isBareHandleToken(handle)) {
    return undefined;
  }

  const keys = Object.keys(value);
  const allowedKeys = new Set(['handle', 'value', 'preview']);
  return keys.every(key => allowedKeys.has(key)) ? handle : undefined;
}

export async function resolveValueHandles(value: unknown, env: Environment): Promise<unknown> {
  if (isHandleWrapper(value)) {
    return env.resolveHandle(value.handle);
  }

  if (typeof value === 'string' && isBareHandleToken(value)) {
    return env.resolveHandle(value.trim());
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
    const keys = Object.keys(value);
    const suppressNestedHandleKeyResolution =
      keys.length > 1 && typeof value.handle === 'string' && isBareHandleToken(value.handle);
    for (const [key, entry] of Object.entries(value)) {
      if (suppressNestedHandleKeyResolution && key === 'handle') {
        result[key] = entry;
        continue;
      }
      result[key] = await resolveValueHandles(entry, env);
    }
    const toolCollectionMetadata = getToolCollectionMetadata(value);
    if (toolCollectionMetadata) {
      attachToolCollectionMetadata(result, toolCollectionMetadata);
    }
    return result;
  }

  return value;
}
