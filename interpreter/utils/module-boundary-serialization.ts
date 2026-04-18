import type {
  ExecutableVariable,
  RecordVariable,
  Variable
} from '@core/types/variable';
import { markExecutableDefinition } from '@core/types/executable';
import { serializeRecordVariable } from '@core/types/record';
import { isShelfSlotRefValue } from '@core/types/shelf';
import {
  ENVIRONMENT_SERIALIZE_PLACEHOLDER,
  isEnvironment
} from '@interpreter/env/EnvironmentIdentity';
import { serializeShadowEnvironmentMaps } from '@interpreter/eval/import/ShadowEnvSerializer';
import {
  getCapturedModuleEnv,
  sealCapturedModuleEnv,
  stashCapturedModuleEnv
} from '@interpreter/eval/import/variable-importer/executable/CapturedModuleEnvKeychain';
import { isStructuredValue } from './structured-value';
import { isVariable } from './variable-resolution';

const STRING_REF_PATTERN = /^@[A-Za-z0-9_.-]+$/;

export interface BoundarySerializeOptions {
  variableMap?: Map<string, Variable>;
  resolveStrings?: boolean;
  resolveVariable?: (name: string) => Variable | undefined;
  serializeShadowEnvs?: (envs: unknown) => unknown;
  serializeModuleEnv?: (moduleEnv: Map<string, Variable>, seen?: WeakSet<object>) => unknown;
  resolveExecutableCapturedModuleEnv?: (
    executable: ExecutableVariable,
    defaultCapturedModuleEnv: unknown
  ) => unknown;
  serializingEnvs?: WeakSet<object>;
  serializedModuleEnvCache?: WeakMap<object, unknown>;
}

interface VariableReferenceNode {
  type: 'VariableReference';
  identifier: string;
  fields?: unknown[];
}

interface AstObjectNode {
  type: 'object';
  entries?: unknown[];
  properties?: Record<string, unknown>;
}

interface BoundarySerializeContext {
  variableMap?: Map<string, Variable>;
  resolveStrings: boolean;
  resolveVariable?: (name: string) => Variable | undefined;
  serializeShadowEnvs: (envs: unknown) => unknown;
  serializeModuleEnv?: (moduleEnv: Map<string, Variable>, seen?: WeakSet<object>) => unknown;
  resolveExecutableCapturedModuleEnv?: (
    executable: ExecutableVariable,
    defaultCapturedModuleEnv: unknown
  ) => unknown;
  serializingEnvs: WeakSet<object>;
  serializedModuleEnvCache: WeakMap<object, unknown>;
}

function normalizeSerializeOptions(
  options?: BoundarySerializeOptions
): BoundarySerializeContext {
  return {
    variableMap: options?.variableMap,
    resolveStrings: options?.resolveStrings !== false,
    resolveVariable: options?.resolveVariable,
    serializeShadowEnvs: options?.serializeShadowEnvs ?? serializeShadowEnvironmentMaps,
    serializeModuleEnv: options?.serializeModuleEnv,
    resolveExecutableCapturedModuleEnv: options?.resolveExecutableCapturedModuleEnv,
    serializingEnvs: options?.serializingEnvs ?? new WeakSet<object>(),
    serializedModuleEnvCache: options?.serializedModuleEnvCache ?? new WeakMap<object, unknown>()
  };
}

function resolveVariableByName(
  name: string,
  context: BoundarySerializeContext
): Variable | undefined {
  return context.variableMap?.get(name) ?? context.resolveVariable?.(name);
}

function isVariableReferenceNode(value: unknown): value is VariableReferenceNode {
  return Boolean(
    value
      && typeof value === 'object'
      && (value as { type?: unknown }).type === 'VariableReference'
      && typeof (value as { identifier?: unknown }).identifier === 'string'
  );
}

function isAstObjectNode(value: unknown): value is AstObjectNode {
  return Boolean(
    value
      && typeof value === 'object'
      && (value as { type?: unknown }).type === 'object'
      && (
        Array.isArray((value as { entries?: unknown[] }).entries)
        || (
          'properties' in (value as Record<string, unknown>)
          && typeof (value as { properties?: unknown }).properties === 'object'
          && (value as { properties?: unknown }).properties !== null
        )
      )
  );
}

function isSerializedBoundaryValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.__executable === true
    || candidate.__recordVariable === true
    || candidate.__record === true
    || candidate.__template === true
    || candidate.__arraySnapshot === true
  );
}

function shouldRecurseResolvedValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value) || isStructuredValue(value) || isShelfSlotRefValue(value)) {
    return false;
  }
  return !isSerializedBoundaryValue(value);
}

function serializeCapturedModuleEnv(
  moduleEnv: Map<string, Variable>,
  context: BoundarySerializeContext
): unknown {
  if (context.serializedModuleEnvCache.has(moduleEnv)) {
    return context.serializedModuleEnvCache.get(moduleEnv);
  }

  if (context.serializeModuleEnv) {
    const serialized = context.serializeModuleEnv(moduleEnv, context.serializingEnvs);
    context.serializedModuleEnvCache.set(moduleEnv, serialized);
    return serialized;
  }

  if (context.serializingEnvs.has(moduleEnv)) {
    return undefined;
  }

  context.serializingEnvs.add(moduleEnv);
  try {
    const serialized = serializeModuleEnvFallback(moduleEnv, context);
    context.serializedModuleEnvCache.set(moduleEnv, serialized);
    return serialized;
  } finally {
    context.serializingEnvs.delete(moduleEnv);
  }
}

function serializeModuleEnvFallback(
  moduleEnv: Map<string, Variable>,
  context: BoundarySerializeContext
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, variable] of moduleEnv) {
    result[name] = serializeVariableValue(variable, context);
  }
  return result;
}

function serializeExecutableVariable(
  execVar: ExecutableVariable,
  context: BoundarySerializeContext
): Record<string, unknown> {
  const serializedValue =
    execVar.value && typeof execVar.value === 'object'
      ? markExecutableDefinition(execVar.value)
      : execVar.value;
  const serializedExecutableDef =
    execVar.internal?.executableDef && typeof execVar.internal.executableDef === 'object'
      ? markExecutableDefinition(execVar.internal.executableDef)
      : execVar.internal?.executableDef;
  let serializedInternal: Record<string, unknown> = { ...(execVar.internal ?? {}) };
  const defaultCapturedModuleEnv =
    getCapturedModuleEnv(execVar.internal)
    ?? getCapturedModuleEnv(execVar);
  const capturedModuleEnv = context.resolveExecutableCapturedModuleEnv
    ? context.resolveExecutableCapturedModuleEnv(execVar, defaultCapturedModuleEnv)
    : defaultCapturedModuleEnv;

  if (serializedInternal.capturedShadowEnvs) {
    serializedInternal = {
      ...serializedInternal,
      capturedShadowEnvs: context.serializeShadowEnvs(serializedInternal.capturedShadowEnvs)
    };
  }

  if (capturedModuleEnv instanceof Map) {
    sealCapturedModuleEnv(
      serializedInternal,
      serializeCapturedModuleEnv(capturedModuleEnv, context)
    );
  } else if (capturedModuleEnv !== undefined) {
    sealCapturedModuleEnv(serializedInternal, capturedModuleEnv);
  }

  const result = {
    __executable: true,
    name: execVar.name,
    value: serializedValue,
    paramNames: execVar.paramNames,
    paramTypes: execVar.paramTypes,
    description: execVar.description,
    executableDef: serializedExecutableDef,
    mx: { ...(execVar.mx ?? {}) },
    internal: serializedInternal
  };
  stashCapturedModuleEnv(result, getCapturedModuleEnv(serializedInternal));
  return result;
}

function serializeVariableValue(
  variable: Variable,
  context: BoundarySerializeContext
): unknown {
  if (variable.type === 'executable') {
    return serializeExecutableVariable(variable as ExecutableVariable, context);
  }
  if (variable.type === 'record') {
    return serializeRecordVariable(variable as RecordVariable);
  }
  return variable.value;
}

function applyFieldAccess(
  value: unknown,
  fields?: unknown[]
): unknown {
  if (!fields || fields.length === 0) {
    return value;
  }

  let result = value;
  for (const field of fields) {
    if (!field || typeof field !== 'object') {
      continue;
    }

    const fieldNode = field as { type?: unknown; value?: unknown };
    if (fieldNode.type === 'field' || fieldNode.type === 'bracketAccess') {
      const key = fieldNode.value;
      if (result && typeof result === 'object' && key !== undefined && key in result) {
        result = (result as Record<string | number, unknown>)[key as string | number];
        continue;
      }
      return null;
    }

    if (fieldNode.type === 'numericField' || fieldNode.type === 'arrayIndex') {
      const index = typeof fieldNode.value === 'number' ? fieldNode.value : Number(fieldNode.value);
      if (Array.isArray(result)) {
        result = result[index];
        continue;
      }
      if (result && typeof result === 'object' && index in result) {
        result = (result as Record<number, unknown>)[index];
        continue;
      }
      return null;
    }

    if (fieldNode.type === 'wildcardIndex') {
      return null;
    }
  }

  return result;
}

function resolveObjectKey(
  key: unknown,
  context: BoundarySerializeContext
): string {
  if (typeof key === 'string' || typeof key === 'number' || typeof key === 'boolean') {
    return String(key);
  }

  if (
    key
    && typeof key === 'object'
    && 'needsInterpolation' in (key as Record<string, unknown>)
    && Array.isArray((key as { parts?: unknown[] }).parts)
  ) {
    return ((key as { parts: unknown[] }).parts ?? [])
      .map(part => {
        const resolved = serializeModuleBoundaryValueInternal(part, context);
        if (typeof resolved === 'string' || typeof resolved === 'number' || typeof resolved === 'boolean') {
          return String(resolved);
        }
        if (isStructuredValue(resolved)) {
          return resolved.text;
        }
        if (resolved && typeof resolved === 'object' && 'content' in (resolved as Record<string, unknown>)) {
          return String((resolved as Record<string, unknown>).content ?? '');
        }
        return '';
      })
      .join('');
  }

  if (
    key
    && typeof key === 'object'
    && (key as { type?: unknown }).type === 'Literal'
  ) {
    return String((key as { value?: unknown }).value ?? '');
  }

  if (
    key
    && typeof key === 'object'
    && (key as { type?: unknown }).type === 'Text'
  ) {
    return String((key as { content?: unknown }).content ?? '');
  }

  const resolved = serializeModuleBoundaryValueInternal(key, context);
  if (
    typeof resolved === 'string'
    || typeof resolved === 'number'
    || typeof resolved === 'boolean'
  ) {
    return String(resolved);
  }
  if (isStructuredValue(resolved)) {
    return resolved.text;
  }
  return String(resolved ?? '');
}

function serializeAstObjectNode(
  value: AstObjectNode,
  context: BoundarySerializeContext
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  if (Array.isArray(value.entries) && value.entries.length > 0) {
    for (const entry of value.entries) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const typedEntry = entry as { type?: unknown; key?: unknown; value?: unknown[] | unknown };
      if (typedEntry.type === 'pair') {
        resolved[resolveObjectKey(typedEntry.key, context)] = serializeModuleBoundaryValueInternal(
          typedEntry.value,
          context
        );
        continue;
      }
      if (typedEntry.type === 'spread') {
        for (const spreadNode of Array.isArray(typedEntry.value) ? typedEntry.value : []) {
          const spreadValue = serializeModuleBoundaryValueInternal(spreadNode, context);
          if (spreadValue && typeof spreadValue === 'object' && !Array.isArray(spreadValue)) {
            Object.assign(resolved, spreadValue);
            continue;
          }
          throw new Error('Cannot spread non-object value during import resolution');
        }
      }
    }
    return resolved;
  }

  if (value.properties) {
    for (const [key, entry] of Object.entries(value.properties)) {
      resolved[key] = serializeModuleBoundaryValueInternal(entry, context);
    }
    return resolved;
  }

  return serializePlainObject(value as Record<string, unknown>, context);
}

function serializePlainObject(
  value: Record<string, unknown>,
  context: BoundarySerializeContext
): Record<string, unknown> {
  if (isSerializedBoundaryValue(value)) {
    return value;
  }

  const resolved: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    resolved[key] = serializeModuleBoundaryValueInternal(entry, context);
  }
  return resolved;
}

function resolveVariableReferenceNode(
  node: VariableReferenceNode,
  context: BoundarySerializeContext
): unknown {
  const referencedVariable = resolveVariableByName(node.identifier, context);
  if (!referencedVariable) {
    throw new Error(`Variable reference @${node.identifier} not found during import`);
  }

  let result = serializeVariableValue(referencedVariable, context);
  result = applyFieldAccess(result, node.fields);

  if (shouldRecurseResolvedValue(result)) {
    return serializeModuleBoundaryValueInternal(result, context);
  }

  return result;
}

function serializeModuleBoundaryValueInternal(
  value: unknown,
  context: BoundarySerializeContext
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (isEnvironment(value)) {
    return ENVIRONMENT_SERIALIZE_PLACEHOLDER;
  }

  if (isStructuredValue(value) || isShelfSlotRefValue(value) || isSerializedBoundaryValue(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => serializeModuleBoundaryValueInternal(item, context));
  }

  if (isVariable(value)) {
    return serializeVariableValue(value, context);
  }

  if (typeof value === 'string' && context.resolveStrings && STRING_REF_PATTERN.test(value)) {
    const referencedVariable = resolveVariableByName(value.slice(1), context);
    return referencedVariable ? serializeVariableValue(referencedVariable, context) : value;
  }

  if (isVariableReferenceNode(value)) {
    return resolveVariableReferenceNode(value, context);
  }

  if (isAstObjectNode(value)) {
    return serializeAstObjectNode(value, context);
  }

  if (typeof value === 'object') {
    return serializePlainObject(value as Record<string, unknown>, context);
  }

  return value;
}

export function serializeModuleBoundaryValue<T = unknown>(
  value: unknown,
  options?: BoundarySerializeOptions
): T {
  return serializeModuleBoundaryValueInternal(
    value,
    normalizeSerializeOptions(options)
  ) as T;
}
