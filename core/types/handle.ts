const HANDLE_KEY = 'handle';

export interface FactSourceHandle {
  kind: 'record-field';
  ref: string;
  sourceRef: string;
  field: string;
  instanceKey?: string;
  coercionId?: string;
  position?: number;
  tiers?: readonly string[];
}

export interface HandleWrapper {
  handle: string;
}

function normalizeIdentifierPath(value: string, options?: { requireLeadingAt?: boolean }): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Identifier path cannot be empty');
  }

  const body = options?.requireLeadingAt === true
    ? (trimmed.startsWith('@') ? trimmed.slice(1) : trimmed)
    : trimmed;
  const segments = body.split('.');
  if (segments.length === 0) {
    throw new Error(`Invalid identifier path '${value}'`);
  }

  const normalized = segments.map(segment => {
    const entry = segment.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry)) {
      throw new Error(`Invalid identifier segment '${segment}'`);
    }
    return entry.toLowerCase();
  });

  return `${options?.requireLeadingAt === true ? '@' : ''}${normalized.join('.')}`;
}

export function createFactSourceHandle(input: {
  sourceRef: string;
  field: string;
  instanceKey?: string;
  coercionId?: string;
  position?: number;
  tiers?: readonly string[];
}): FactSourceHandle {
  const sourceRef = normalizeIdentifierPath(input.sourceRef, { requireLeadingAt: true });
  const field = normalizeIdentifierPath(input.field).toLowerCase();
  const instanceKey = typeof input.instanceKey === 'string' && input.instanceKey.trim().length > 0
    ? input.instanceKey.trim()
    : undefined;
  const coercionId = typeof input.coercionId === 'string' && input.coercionId.trim().length > 0
    ? input.coercionId.trim()
    : undefined;
  const position = typeof input.position === 'number' && Number.isInteger(input.position) && input.position >= 0
    ? input.position
    : undefined;
  const tiers = input.tiers
    ?.map(tier => tier.trim().toLowerCase())
    .filter(Boolean)
    .sort();

  return {
    kind: 'record-field',
    ref: `${sourceRef}.${field}`,
    sourceRef,
    field,
    ...(instanceKey ? { instanceKey } : {}),
    ...(coercionId ? { coercionId } : {}),
    ...(position !== undefined ? { position } : {}),
    ...(tiers && tiers.length > 0 ? { tiers: Object.freeze(Array.from(new Set(tiers))) } : {})
  };
}

export function isFactSourceHandle(value: unknown): value is FactSourceHandle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== 'record-field') {
    return false;
  }
  if (
    typeof candidate.ref !== 'string' ||
    typeof candidate.sourceRef !== 'string' ||
    typeof candidate.field !== 'string'
  ) {
    return false;
  }

  if (candidate.instanceKey !== undefined && typeof candidate.instanceKey !== 'string') {
    return false;
  }
  if (candidate.coercionId !== undefined && typeof candidate.coercionId !== 'string') {
    return false;
  }
  if (
    candidate.position !== undefined &&
    (!Number.isInteger(candidate.position) || (candidate.position as number) < 0)
  ) {
    return false;
  }

  if (candidate.tiers !== undefined && !Array.isArray(candidate.tiers)) {
    return false;
  }

  return true;
}

export function createHandleWrapper(handle: string): HandleWrapper {
  const value = handle.trim();
  if (!value) {
    throw new Error('Handle cannot be empty');
  }
  return { [HANDLE_KEY]: value };
}

export function isHandleWrapper(value: unknown): value is HandleWrapper {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  return keys.length === 1 && keys[0] === HANDLE_KEY && typeof candidate.handle === 'string' && candidate.handle.trim().length > 0;
}
