const capturedModuleEnvKeychain = new WeakMap<object, unknown>();
const capturedModuleOwnerEnvKeychain = new WeakMap<object, unknown>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function hasOwnCapturedModuleEnv(target: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(target, 'capturedModuleEnv');
}

/**
 * Store captured module environments in a sealed/non-enumerable slot.
 * This keeps runtime access intact while preventing accidental user-space leaks
 * through Object.keys/JSON.stringify on serialized executable internals.
 */
export function sealCapturedModuleEnv(
  target: unknown,
  capturedModuleEnv: unknown
): void {
  if (!isRecord(target)) {
    return;
  }

  if (capturedModuleEnv === undefined) {
    capturedModuleEnvKeychain.delete(target);
    delete target.capturedModuleEnv;
    return;
  }

  if (hasOwnCapturedModuleEnv(target) && target.capturedModuleEnv === capturedModuleEnv) {
    return;
  }

  const existing = Object.getOwnPropertyDescriptor(target, 'capturedModuleEnv');
  if (existing && 'value' in existing && existing.enumerable === false) {
    target.capturedModuleEnv = capturedModuleEnv;
    return;
  }

  Object.defineProperty(target, 'capturedModuleEnv', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: capturedModuleEnv
  });
}

export function stashCapturedModuleEnv(
  target: unknown,
  capturedModuleEnv: unknown
): void {
  if (!isRecord(target)) {
    return;
  }

  if (capturedModuleEnv === undefined) {
    capturedModuleEnvKeychain.delete(target);
    return;
  }

  capturedModuleEnvKeychain.set(target, capturedModuleEnv);
}

export function getCapturedModuleEnv(target: unknown): unknown {
  if (!isRecord(target)) {
    return undefined;
  }

  if (hasOwnCapturedModuleEnv(target)) {
    return target.capturedModuleEnv;
  }

  if (capturedModuleEnvKeychain.has(target)) {
    return capturedModuleEnvKeychain.get(target);
  }

  return target.capturedModuleEnv;
}

export function stashCapturedModuleOwnerEnv(
  target: unknown,
  ownerEnv: unknown
): void {
  if (!isRecord(target)) {
    return;
  }

  if (ownerEnv === undefined) {
    capturedModuleOwnerEnvKeychain.delete(target);
    return;
  }

  capturedModuleOwnerEnvKeychain.set(target, ownerEnv);
}

export function getCapturedModuleOwnerEnv(target: unknown): unknown {
  if (!isRecord(target)) {
    return undefined;
  }

  return capturedModuleOwnerEnvKeychain.get(target);
}
