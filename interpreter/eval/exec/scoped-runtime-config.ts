import type { ExecInvocation } from '@core/types';
import { isRuntimeTraceLevel, type RuntimeTraceLevel } from '@core/types/trace';
import type { ExecutableDefinition } from '@core/types/executable';
import { MlldInterpreterError } from '@core/errors';
import type { Environment } from '@interpreter/env/Environment';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { getWithClauseField, normalizeWithClauseFields } from '@interpreter/utils/with-clause';
import { convertEntriesToProperties } from '@interpreter/utils/object-compat';

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

  if (Object.keys(resolvedScopedConfig).length > 0) {
    const scopedConfig = nextEnv.getScopedEnvironmentConfig();
    const scopedEnv = nextEnv.createChild();
    scopedEnv.setScopedEnvironmentConfig({
      ...(scopedConfig ?? {}),
      ...resolvedScopedConfig
    });
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
