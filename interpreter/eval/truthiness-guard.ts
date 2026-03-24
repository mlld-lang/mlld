import { MlldError } from '@core/errors';
import { isStructuredValue } from '@interpreter/utils/structured-value';

type ErrorLikeLocation = {
  message: string;
  path: string;
};

function isErrorMarkerObject(value: unknown): value is {
  index: number;
  key: unknown;
  message: string;
  error: string;
  value?: unknown;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const marker = value as Record<string, unknown>;
  return (
    typeof marker.index === 'number' &&
    'key' in marker &&
    typeof marker.message === 'string' &&
    typeof marker.error === 'string'
  );
}

function describeErrorLikeBooleanValue(
  value: unknown,
  path = 'value',
  seen = new Set<object>()
): ErrorLikeLocation | null {
  if (isStructuredValue(value)) {
    const structuredRef = value as object;
    if (seen.has(structuredRef)) {
      return null;
    }
    seen.add(structuredRef);
    return describeErrorLikeBooleanValue(value.data, `${path}.data`, seen);
  }

  if (value instanceof MlldError || value instanceof Error) {
    return {
      path,
      message: value.message
    };
  }

  if (Array.isArray(value)) {
    const arrayRef = value as object;
    if (seen.has(arrayRef)) {
      return null;
    }
    seen.add(arrayRef);

    for (let index = 0; index < value.length; index += 1) {
      const nested = describeErrorLikeBooleanValue(value[index], `${path}[${index}]`, seen);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const objectRef = value as object;
  if (seen.has(objectRef)) {
    return null;
  }
  seen.add(objectRef);

  const record = value as Record<string, unknown>;

  if (record.__error === true) {
    return {
      path,
      message: typeof record.__message === 'string' ? record.__message : 'unknown error'
    };
  }

  if (isErrorMarkerObject(record)) {
    return {
      path,
      message: record.message
    };
  }

  return null;
}

export function assertNoErrorLikeBooleanValue(value: unknown, context: string): void {
  const location = describeErrorLikeBooleanValue(value);
  if (!location) {
    return;
  }

  throw new Error(
    `${context} received an error-like value at ${location.path}: ${location.message}. ` +
      'Handle the error explicitly before using it as a boolean.'
  );
}
