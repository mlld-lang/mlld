const ENVIRONMENT_RUNTIME_TAG = Symbol.for('mlld.environment');

export const ENVIRONMENT_SERIALIZE_PLACEHOLDER = '[Environment]';

export function markEnvironment(value: object): void {
  if ((value as Record<PropertyKey, unknown>)[ENVIRONMENT_RUNTIME_TAG] === true) {
    return;
  }

  Object.defineProperty(value, ENVIRONMENT_RUNTIME_TAG, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });
}

export function isEnvironmentTagged(value: unknown): value is Record<PropertyKey, unknown> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as Record<PropertyKey, unknown>)[ENVIRONMENT_RUNTIME_TAG] === true
  );
}
