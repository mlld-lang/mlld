import { MlldSecurityError } from '@core/errors';
import type { Environment } from '@interpreter/env/Environment';
import type {
  ProjectionExposureEntry,
  ProjectionExposureMatch
} from '@interpreter/env/ProjectionExposureRegistry';
import { resolveValueHandles } from '@interpreter/utils/handle-resolution';
import {
  isStructuredValue,
  wrapStructured
} from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';

export interface ProjectedValueCanonicalizationOptions {
  sessionId?: string | null | undefined;
  matchScope?: 'session' | 'global';
}

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

function normalizeSessionId(
  env: Environment,
  sessionId: string | null | undefined
): string | undefined {
  const explicit = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (explicit.length > 0) {
    return explicit;
  }
  const active = env.getLlmToolConfig()?.sessionId;
  return typeof active === 'string' && active.trim().length > 0 ? active.trim() : undefined;
}

function looksLikeHandleToken(value: string): boolean {
  return /^h_[a-z0-9]+$/.test(value.trim());
}

function resolveBareHandleToken(value: string, env: Environment): unknown {
  const trimmed = value.trim();
  if (!looksLikeHandleToken(trimmed)) {
    return undefined;
  }

  try {
    return env.resolveHandle(trimmed);
  } catch (error) {
    if (error instanceof MlldSecurityError && error.code === 'HANDLE_NOT_FOUND') {
      return undefined;
    }
    throw error;
  }
}

function createAmbiguousProjectedValueError(
  emittedValue: string,
  matches: readonly ProjectionExposureEntry[]
): MlldSecurityError {
  const handles = Array.from(
    new Set(
      matches
        .map(match => match.handle)
        .filter((handle): handle is string => typeof handle === 'string' && handle.trim().length > 0)
    )
  );

  return new MlldSecurityError(
    `Ambiguous projected value "${emittedValue}" matches multiple emitted values. Use the handle wrapper from the tool result instead.`,
    {
      code: 'AMBIGUOUS_PROJECTED_VALUE',
      details: {
        emittedValue,
        handles,
        matches: matches.map(match => ({
          kind: match.kind,
          field: match.field,
          record: match.record,
          handle: match.handle,
          emittedPreview: match.emittedPreview,
          emittedLiteral: match.emittedLiteral
        }))
      }
    }
  );
}

function resolveMatchedExposure(
  emittedValue: string,
  match: ProjectionExposureMatch
): unknown {
  if (match.status === 'none') {
    return undefined;
  }
  if (match.status === 'ambiguous') {
    throw createAmbiguousProjectedValueError(emittedValue, match.matches);
  }
  return match.matches[0]?.value;
}

async function canonicalizeAliases(
  value: unknown,
  env: Environment,
  sessionId: string | undefined,
  matchScope: 'session' | 'global'
): Promise<unknown> {
  if (typeof value === 'string') {
    const bareHandle = resolveBareHandleToken(value, env);
    if (bareHandle !== undefined) {
      return bareHandle;
    }

    if (!sessionId && matchScope !== 'global') {
      return value;
    }

    const preview = resolveMatchedExposure(value, sessionId
      ? env.matchProjectionPreview(sessionId, value)
      : env.matchAnyProjectionPreview(value));
    if (preview !== undefined) {
      return preview;
    }

    const literal = resolveMatchedExposure(value, sessionId
      ? env.matchProjectionLiteral(sessionId, value)
      : env.matchAnyProjectionLiteral(value));
    if (literal !== undefined) {
      return literal;
    }
    return value;
  }

  if (isVariable(value)) {
    const resolvedValue = await canonicalizeAliases(value.value, env, sessionId, matchScope);
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
    const resolvedData = await canonicalizeAliases(value.data, env, sessionId, matchScope);
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
    return Promise.all(value.map(item => canonicalizeAliases(item, env, sessionId, matchScope)));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = await canonicalizeAliases(entry, env, sessionId, matchScope);
    }
    return result;
  }

  return value;
}

export async function canonicalizeProjectedValue(
  value: unknown,
  env: Environment,
  options: ProjectedValueCanonicalizationOptions = {}
): Promise<unknown> {
  const matchScope = options.matchScope ?? 'session';
  const sessionId = matchScope === 'session'
    ? normalizeSessionId(env, options.sessionId)
    : undefined;
  const handleResolved = await resolveValueHandles(value, env);
  return canonicalizeAliases(handleResolved, env, sessionId, matchScope);
}
