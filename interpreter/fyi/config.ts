import type { BaseMlldNode } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import {
  asData,
  isStructuredValue
} from '@interpreter/utils/structured-value';
import { accessFields } from '@interpreter/utils/field-access';
import {
  isVariable,
  resolveVariable,
  ResolutionContext
} from '@interpreter/utils/variable-resolution';

export interface ResolvedFyiConfig {
  facts?: unknown[];
}

function isAstObjectNode(value: unknown): value is {
  type: 'object';
  entries?: Array<{ type?: string; key?: string; value?: unknown }>;
} {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { type?: unknown }).type === 'object' &&
      Array.isArray((value as { entries?: unknown }).entries)
  );
}

function isAstArrayNode(value: unknown): value is {
  type: 'array';
  items?: unknown[];
} {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { type?: unknown }).type === 'array' &&
      Array.isArray((value as { items?: unknown }).items)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

async function resolveFyiFactRoot(value: unknown, env: Environment): Promise<unknown> {
  if (isVariable(value) || isStructuredValue(value)) {
    return value;
  }

  if (value && typeof value === 'object' && (value as any).type === 'VariableReference') {
    const ref = value as any;
    const variable = env.getVariable(ref.identifier) ?? await env.getResolverVariable(ref.identifier);
    if (!variable) {
      return undefined;
    }

    let resolved: unknown;
    if (Array.isArray(ref.fields) && ref.fields.length > 0) {
      resolved = await resolveVariable(variable, env, ResolutionContext.FieldAccess);
      const fieldResult = await accessFields(resolved, ref.fields, {
        env,
        preserveContext: true,
        sourceLocation: ref.location,
        returnUndefinedForMissing: true
      });
      resolved = (fieldResult as { value: unknown }).value;
    } else {
      resolved = variable;
    }

    if (isVariable(resolved)) {
      return resolved;
    }
    if (isStructuredValue(resolved)) {
      return resolved;
    }
    return resolved;
  }

  if (value && typeof value === 'object' && 'type' in (value as Record<string, unknown>)) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(value as BaseMlldNode, env, { isExpression: true });
    return result.value;
  }

  return value;
}

async function resolveFactsList(value: unknown, env: Environment): Promise<unknown[]> {
  const source = isStructuredValue(value) ? asData(value) : value;

  if (isAstArrayNode(source)) {
    const resolved = await Promise.all((source.items ?? []).map(item => resolveFyiFactRoot(item, env)));
    return resolved.filter(item => item !== undefined);
  }

  if (Array.isArray(source)) {
    const resolved = await Promise.all(source.map(item => resolveFyiFactRoot(item, env)));
    return resolved.filter(item => item !== undefined);
  }

  const single = await resolveFyiFactRoot(source, env);
  return single === undefined ? [] : [single];
}

export async function resolveFyiConfig(
  rawValue: unknown,
  env: Environment
): Promise<ResolvedFyiConfig | undefined> {
  if (rawValue === undefined || rawValue === null) {
    return undefined;
  }

  if (isAstObjectNode(rawValue)) {
    const factsEntry = rawValue.entries?.find(entry => entry?.type === 'pair' && entry.key === 'facts');
    if (!factsEntry) {
      return {};
    }
    return { facts: await resolveFactsList(factsEntry.value, env) };
  }

  if (isPlainObject(rawValue)) {
    const factsValue = rawValue.facts;
    if (factsValue === undefined) {
      return {};
    }
    return { facts: await resolveFactsList(factsValue, env) };
  }

  return undefined;
}
