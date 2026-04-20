import type { ExecInvocation } from '@core/types';
import { isRuntimeTraceLevel, type RuntimeTraceLevel } from '@core/types/trace';
import type { ExecutableDefinition } from '@core/types/executable';
import { MlldInterpreterError } from '@core/errors';
import type { Environment } from '@interpreter/env/Environment';
import type { SessionDefinition } from '@core/types/session';
import type { EnvironmentConfig } from '@core/types/environment';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { getWithClauseField, normalizeWithClauseFields } from '@interpreter/utils/with-clause';
import { convertEntriesToProperties } from '@interpreter/utils/object-compat';
import {
  mergeSessionScopedConfig,
  resolveSessionSchemaReference
} from '@interpreter/session/runtime';

export function normalizeInvocationWithClause(node: ExecInvocation): Record<string, any> | undefined {
  const withClause = node.withClause as any;
  if (!withClause) {
    return undefined;
  }

  if (!Array.isArray(withClause)) {
    return normalizeWithClauseFields(withClause) ?? withClause;
  }

  const inlineValue = withClause[0];
  if (inlineValue?.type !== 'inlineValue' || inlineValue?.value?.type !== 'object') {
    return undefined;
  }

  return convertEntriesToProperties(inlineValue.value.entries ?? []);
}

export async function applyInvocationScopedRuntimeConfig(args: {
  runtimeEnv: Environment;
  env: Environment;
  definition: ExecutableDefinition;
  node: ExecInvocation;
  invocationWithClause: Record<string, any> | undefined;
}): Promise<Environment> {
  let nextEnv = args.runtimeEnv;
  const resolvedScopedConfig: Record<string, unknown> = {};

  const definitionSessionRaw = getExecutableDefinitionWithClauseField(args.definition, 'session');
  const invocationSessionRaw = getInvocationWithClauseField(args.node, args.invocationWithClause, 'session');
  const definitionSeedRaw = getExecutableDefinitionWithClauseField(args.definition, 'seed');
  const invocationSeedRaw = getInvocationWithClauseField(args.node, args.invocationWithClause, 'seed');
  const invocationOverride = await resolveScopedExecSessionOverride(
    getInvocationWithClauseField(args.node, args.invocationWithClause, 'override'),
    args.env
  );

  const definitionSession =
    definitionSessionRaw !== undefined
      ? await resolveSessionSchemaReference(definitionSessionRaw, args.env)
      : undefined;
  const invocationSession =
    invocationSessionRaw !== undefined
      ? await resolveSessionSchemaReference(invocationSessionRaw, args.env)
      : undefined;
  const mergedSession = mergeScopedSessionAttachment({
    definitionSession,
    invocationSession,
    definitionSeedRaw,
    invocationSeedRaw,
    invocationOverride
  });

  const resolvedDefinitionDisplay = await resolveScopedExecDisplayMode(
    getExecutableDefinitionWithClauseField(args.definition, 'display'),
    args.env
  );
  if (resolvedDefinitionDisplay !== undefined) {
    resolvedScopedConfig.display = resolvedDefinitionDisplay;
  }

  const resolvedInvocationDisplay = await resolveScopedExecDisplayMode(
    getInvocationWithClauseField(args.node, args.invocationWithClause, 'display'),
    args.env
  );
  if (resolvedInvocationDisplay !== undefined) {
    resolvedScopedConfig.display = resolvedInvocationDisplay;
  }

  const resolvedDefinitionTrace = await resolveScopedExecTraceLevel(
    getExecutableDefinitionWithClauseField(args.definition, 'trace'),
    args.env
  );
  const resolvedInvocationTrace = await resolveScopedExecTraceLevel(
    getInvocationWithClauseField(args.node, args.invocationWithClause, 'trace'),
    args.env
  );

  if (mergedSession) {
    resolvedScopedConfig.session = {
      definition: mergedSession.definition,
      ...(mergedSession.seed !== undefined ? { seed: mergedSession.seed } : {})
    };
    if (mergedSession.seed !== undefined) {
      resolvedScopedConfig.seed = mergedSession.seed;
    }
  } else if (definitionSeedRaw !== undefined || invocationSeedRaw !== undefined) {
    throw new MlldInterpreterError(
      'seed requires an attached session',
      'session',
      undefined,
      { code: 'INVALID_SESSION_SEED' }
    );
  }

  if (Object.keys(resolvedScopedConfig).length > 0) {
    const scopedConfig = nextEnv.getScopedEnvironmentConfig();
    const scopedEnv = nextEnv.createChild();
    const nextScopedConfig: EnvironmentConfig = {
      ...(scopedConfig ?? {}),
      ...resolvedScopedConfig
    };
    if (!mergedSession) {
      delete (nextScopedConfig as Record<string, unknown>).session;
      delete (nextScopedConfig as Record<string, unknown>).seed;
      scopedEnv.setScopedEnvironmentConfig(nextScopedConfig);
    } else {
      scopedEnv.setScopedEnvironmentConfig(mergeSessionScopedConfig({
        baseConfig: nextScopedConfig,
        definition: mergedSession.definition,
        seed: mergedSession.seed
      }));
    }
    nextEnv = scopedEnv;
  }

  const resolvedTraceLevel = resolvedInvocationTrace ?? resolvedDefinitionTrace;
  if (resolvedTraceLevel !== undefined) {
    const tracedEnv = nextEnv.createChild();
    tracedEnv.setRuntimeTraceOverride(resolvedTraceLevel);
    nextEnv = tracedEnv;
  }

  return nextEnv;
}

async function resolveScopedExecSessionOverride(
  raw: unknown,
  env: Environment
): Promise<boolean> {
  if (raw === undefined || raw === null || raw === false) {
    return false;
  }

  const value = await resolveScopedExecConfigValue(raw, env);
  if (value === undefined || value === null || value === false) {
    return false;
  }

  if (typeof value === 'string' && value.trim() === 'session') {
    return true;
  }

  throw new MlldInterpreterError(
    `override must be the string "session" when overriding a wrapper-attached session.`,
    'session',
    undefined,
    { code: 'INVALID_SESSION_OVERRIDE' }
  );
}

async function resolveScopedExecConfigValue(
  raw: unknown,
  env: Environment
): Promise<unknown> {
  let value = raw;

  if (value && typeof value === 'object' && 'type' in (value as Record<string, unknown>)) {
    const { evaluate } = await import('../../core/interpreter');
    const result = await evaluate(value as any, env, { isExpression: true });
    value = result.value;
  }

  const { extractVariableValue, isVariable } = await import('../../utils/variable-resolution');
  if (isVariable(value)) {
    value = await extractVariableValue(value, env);
  }

  if (isStructuredValue(value)) {
    value = asData(value);
  }

  return value;
}

async function resolveScopedExecDisplayMode(
  raw: unknown,
  env: Environment
): Promise<string | undefined> {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const value = await resolveScopedExecConfigValue(raw, env);
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new MlldInterpreterError('display must be a string.');
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function resolveScopedExecTraceLevel(
  raw: unknown,
  env: Environment
): Promise<RuntimeTraceLevel | undefined> {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const value = await resolveScopedExecConfigValue(raw, env);
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRuntimeTraceLevel(value)) {
    throw new MlldInterpreterError('trace must be one of: off, effects, handle, handles, verbose.');
  }

  return value;
}

function getExecutableDefinitionWithClauseField(
  definition: ExecutableDefinition,
  field: string
): unknown {
  const direct = getWithClauseField((definition as any).withClause, field);
  if (direct !== undefined) {
    return direct;
  }
  return getWithClauseField((definition as any).meta?.withClause, field);
}

function getInvocationWithClauseField(
  node: ExecInvocation,
  invocationWithClause: Record<string, any> | undefined,
  field: string
): unknown {
  if (invocationWithClause && Object.prototype.hasOwnProperty.call(invocationWithClause, field)) {
    return invocationWithClause[field];
  }

  const normalizedMetaWithClause = normalizeWithClauseFields(node.meta?.withClause);
  if (normalizedMetaWithClause && Object.prototype.hasOwnProperty.call(normalizedMetaWithClause, field)) {
    return normalizedMetaWithClause[field];
  }

  return getWithClauseField(node.meta?.withClause, field);
}

function mergeScopedSessionAttachment(args: {
  definitionSession?: SessionDefinition;
  invocationSession?: SessionDefinition;
  definitionSeedRaw?: unknown;
  invocationSeedRaw?: unknown;
  invocationOverride: boolean;
}): { definition: SessionDefinition; seed?: unknown } | undefined {
  const {
    definitionSession,
    invocationSession,
    definitionSeedRaw,
    invocationSeedRaw,
    invocationOverride
  } = args;

  if (!definitionSession && !invocationSession) {
    return undefined;
  }

  if (definitionSession && invocationSession) {
    if (definitionSession.id !== invocationSession.id && !invocationOverride) {
      throw new MlldInterpreterError(
        `session key conflicts; use override: 'session' to replace`,
        'session',
        undefined,
        { code: 'SESSION_OVERRIDE_REQUIRED' }
      );
    }

    if (definitionSession.id !== invocationSession.id) {
      return {
        definition: invocationSession,
        ...(invocationSeedRaw !== undefined ? { seed: invocationSeedRaw } : {})
      };
    }

    const mergedSeed = combineSeedInputs(definitionSeedRaw, invocationSeedRaw);
    return {
      definition: definitionSession,
      ...(mergedSeed !== undefined ? { seed: mergedSeed } : {})
    };
  }

  if (definitionSession) {
    const mergedSeed = combineSeedInputs(definitionSeedRaw, invocationSeedRaw);
    return {
      definition: definitionSession,
      ...(mergedSeed !== undefined ? { seed: mergedSeed } : {})
    };
  }

  return {
    definition: invocationSession!,
    ...(invocationSeedRaw !== undefined ? { seed: invocationSeedRaw } : {})
  };
}

function combineSeedInputs(...entries: unknown[]): unknown {
  const filtered = entries.filter(entry => entry !== undefined);
  if (filtered.length === 0) {
    return undefined;
  }
  return filtered.length === 1 ? filtered[0] : filtered;
}
