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

const EMPTY_FACT_SOURCE_ARRAY: readonly FactSourceHandle[] = Object.freeze([]);
const FACT_SOURCE_HANDLE_CACHE = new Map<string, FactSourceHandle>();
const FACT_SOURCE_ARRAY_CACHE = new Map<string, readonly FactSourceHandle[]>();
const FACT_SOURCE_CACHE_LIMIT = 8192;
const FACT_SOURCE_ARRAY_CACHE_LIMIT = 4096;
const FACT_SOURCE_ARRAY_KEY_LIMIT = 8192;

function rememberBounded<T>(cache: Map<string, T>, key: string, value: T, limit: number): T {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  if (cache.size >= limit) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
  cache.set(key, value);
  return value;
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

export function getFactSourceKey(handle: FactSourceHandle): string {
  return JSON.stringify([
    handle.kind,
    handle.ref,
    handle.sourceRef,
    handle.field,
    handle.instanceKey ?? null,
    handle.coercionId ?? null,
    handle.position ?? null,
    handle.tiers ? Array.from(handle.tiers) : []
  ]);
}

function getLegacyFactSourceKey(handle: Record<string, unknown>): string {
  return JSON.stringify([
    'legacy',
    ...Object.keys(handle)
      .sort()
      .map(key => [key, handle[key]])
  ]);
}

export function internFactSourceHandle(handle: FactSourceHandle): FactSourceHandle {
  const tiers = handle.tiers && handle.tiers.length > 0
    ? Object.freeze(Array.from(new Set(handle.tiers))) as readonly string[]
    : undefined;
  const normalized: FactSourceHandle = Object.freeze({
    kind: handle.kind,
    ref: handle.ref,
    sourceRef: handle.sourceRef,
    field: handle.field,
    ...(handle.instanceKey !== undefined ? { instanceKey: handle.instanceKey } : {}),
    ...(handle.coercionId !== undefined ? { coercionId: handle.coercionId } : {}),
    ...(handle.position !== undefined ? { position: handle.position } : {}),
    ...(tiers ? { tiers } : {})
  });
  return rememberBounded(
    FACT_SOURCE_HANDLE_CACHE,
    getFactSourceKey(normalized),
    normalized,
    FACT_SOURCE_CACHE_LIMIT
  );
}

function internLegacyFactSourceHandle(handle: Record<string, unknown>): FactSourceHandle {
  const normalized = Object.freeze({ ...handle }) as FactSourceHandle;
  return rememberBounded(
    FACT_SOURCE_HANDLE_CACHE,
    getLegacyFactSourceKey(normalized as unknown as Record<string, unknown>),
    normalized,
    FACT_SOURCE_CACHE_LIMIT
  );
}

export function internFactSourceArray(
  handles: Iterable<FactSourceHandle> | undefined
): readonly FactSourceHandle[] {
  if (!handles) {
    return EMPTY_FACT_SOURCE_ARRAY;
  }
  const deduped = new Map<string, FactSourceHandle>();
  for (const handle of handles) {
    if (isFactSourceHandle(handle)) {
      const interned = internFactSourceHandle(handle);
      const key = getFactSourceKey(interned);
      if (!deduped.has(key)) {
        deduped.set(key, interned);
      }
      continue;
    }

    if (handle && typeof handle === 'object' && typeof (handle as Record<string, unknown>).ref === 'string') {
      const interned = internLegacyFactSourceHandle(handle as unknown as Record<string, unknown>);
      const key = getLegacyFactSourceKey(interned as unknown as Record<string, unknown>);
      if (!deduped.has(key)) {
        deduped.set(key, interned);
      }
    }
  }
  if (deduped.size === 0) {
    return EMPTY_FACT_SOURCE_ARRAY;
  }

  const key = Array.from(deduped.keys()).join('\u001f');
  if (key.length <= FACT_SOURCE_ARRAY_KEY_LIMIT) {
    const existing = FACT_SOURCE_ARRAY_CACHE.get(key);
    if (existing) {
      return existing;
    }
    const value = Object.freeze(Array.from(deduped.values()));
    return rememberBounded(
      FACT_SOURCE_ARRAY_CACHE,
      key,
      value,
      FACT_SOURCE_ARRAY_CACHE_LIMIT
    );
  }

  return Object.freeze(Array.from(deduped.values()));
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
  const instanceKey = typeof input.instanceKey === 'string'
    ? input.instanceKey
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

  return internFactSourceHandle({
    kind: 'record-field',
    ref: `${sourceRef}.${field}`,
    sourceRef,
    field,
    ...(instanceKey !== undefined ? { instanceKey } : {}),
    ...(coercionId ? { coercionId } : {}),
    ...(position !== undefined ? { position } : {}),
    ...(tiers && tiers.length > 0 ? { tiers: Object.freeze(Array.from(new Set(tiers))) } : {})
  });
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
