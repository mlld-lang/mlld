import {
  createExecutableVariable,
  isCodeExecutable,
  isDataExecutable,
  markExecutableDefinition,
  type NodeFunctionExecutable
} from '@core/types/executable';
import { MlldInterpreterError } from '@core/errors';
import type { EnvironmentConfig } from '@core/types/environment';
import type { RecordDefinition, RecordFieldDefinition, RecordFieldValueType } from '@core/types/record';
import type {
  SessionBufferedWrite,
  SessionDefinition,
  SessionFinalStateMap,
  SessionFrameInstance,
  SessionScopedAttachment,
  SessionSlotBinding,
  SessionSlotType,
  SessionWriteBuffer,
  SessionWriteOperation
} from '@core/types/session';
import type { Variable, VariableSource } from '@core/types/variable';
import { createObjectVariable, isExecutableVariable } from '@core/types/variable';
import { isHandleWrapper } from '@core/types/handle';
import type { Environment } from '@interpreter/env/Environment';
import {
  wrapStructured,
  isStructuredValue,
  type StructuredValueMetadata
} from '@interpreter/utils/structured-value';
import { extractVariableValue, isVariable } from '@interpreter/utils/variable-resolution';
import { inheritExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import {
  buildSessionFinalTraceEnvelope,
  buildSessionSeedTraceEnvelope,
  buildSessionWriteSdkPayload,
  buildSessionWriteTraceEnvelope
} from './trace-envelope';
import {
  estimateRuntimeTraceValueBytes,
  formatRuntimeTraceSize
} from '@interpreter/tracing/RuntimeTraceValue';

const SESSION_VARIABLE_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'object',
  hasInterpolation: false,
  isMultiLine: false
};

type SessionPathSegment = string | number;

type PendingMutationState = {
  readonly instance: RuntimeSessionInstance;
  readonly slotName: string;
  readonly path: string;
  readonly hadPrevious: boolean;
  readonly previousValue: unknown;
  readonly hadPreviousTrace: boolean;
  readonly previousTraceValue: unknown;
  readonly nextValue: unknown;
  readonly clear: boolean;
  readonly commitWrite: () => void;
};

type SessionCloneStats = {
  visited: number;
  exactReuses: number;
  seenReuses: number;
  structuredValues: number;
  arrays: number;
  objects: number;
  variables: number;
  functions: number;
  primitives: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isAstLikeNode(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { type?: unknown }).type === 'string'
  );
}

function cloneSessionStructuredMetadata(
  metadata: StructuredValueMetadata | undefined
): StructuredValueMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  const { sessions: _sessions, ...rest } = metadata;
  return rest;
}

function createSessionCloneStats(): SessionCloneStats {
  return {
    visited: 0,
    exactReuses: 0,
    seenReuses: 0,
    structuredValues: 0,
    arrays: 0,
    objects: 0,
    variables: 0,
    functions: 0,
    primitives: 0
  };
}

function sessionCloneStatsData(stats: SessionCloneStats): Record<string, unknown> {
  return {
    cloneVisited: stats.visited,
    cloneExactReuses: stats.exactReuses,
    cloneSeenReuses: stats.seenReuses,
    cloneStructuredValues: stats.structuredValues,
    cloneArrays: stats.arrays,
    cloneObjects: stats.objects,
    cloneVariables: stats.variables,
    cloneFunctions: stats.functions,
    clonePrimitives: stats.primitives
  };
}

function cloneSessionValue<T>(value: T, seen: WeakMap<object, unknown> = new WeakMap()): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'function') {
    return value;
  }

  if (isVariable(value)) {
    return value;
  }

  if (isStructuredValue(value)) {
    const existing = seen.get(value as object);
    if (existing) {
      return existing as T;
    }
    const clonedData = cloneSessionValue(value.data as T, seen);
    const clone = wrapStructured(
      clonedData,
      value.type,
      undefined,
      cloneSessionStructuredMetadata(value.metadata)
    ) as typeof value;
    if (value.internal) {
      clone.internal = { ...value.internal };
    }
    inheritExpressionProvenance(clone, value);
    seen.set(value as object, clone);
    return clone as T;
  }

  if (Array.isArray(value)) {
    const existing = seen.get(value as object);
    if (existing) {
      return existing as T;
    }
    const clone: unknown[] = [];
    seen.set(value as object, clone);
    for (const item of value) {
      clone.push(cloneSessionValue(item, seen));
    }
    inheritExpressionProvenance(clone, value);
    return clone as T;
  }

  if (isPlainObject(value)) {
    const existing = seen.get(value as object);
    if (existing) {
      return existing as T;
    }
    const clone: Record<string, unknown> = Object.create(Object.getPrototypeOf(value));
    seen.set(value as object, clone);
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = cloneSessionValue(entry, seen);
    }
    inheritExpressionProvenance(clone, value);
    return clone as T;
  }

  return value;
}

function cloneSessionValueWithReuse<T>(
  value: T,
  previous: unknown,
  seen: WeakMap<object, unknown> = new WeakMap(),
  stats?: SessionCloneStats
): T {
  if (stats) {
    stats.visited += 1;
  }

  if (value === previous) {
    if (stats) {
      stats.exactReuses += 1;
    }
    return previous as T;
  }

  if (value === null || value === undefined) {
    if (stats) {
      stats.primitives += 1;
    }
    return value;
  }

  if (typeof value === 'function') {
    if (stats) {
      stats.functions += 1;
    }
    return value;
  }

  if (isVariable(value)) {
    if (stats) {
      stats.variables += 1;
    }
    return value;
  }

  if (isStructuredValue(value)) {
    const existing = seen.get(value as object);
    if (existing) {
      if (stats) {
        stats.seenReuses += 1;
      }
      return existing as T;
    }
    if (stats) {
      stats.structuredValues += 1;
    }
    const previousStructured = isStructuredValue(previous) ? previous : undefined;
    const clonedData = cloneSessionValueWithReuse(
      value.data as T,
      previousStructured?.data,
      seen,
      stats
    );
    const clone = wrapStructured(
      clonedData,
      value.type,
      undefined,
      cloneSessionStructuredMetadata(value.metadata)
    ) as typeof value;
    if (value.internal) {
      clone.internal = { ...value.internal };
    }
    inheritExpressionProvenance(clone, value);
    seen.set(value as object, clone);
    return clone as T;
  }

  if (Array.isArray(value)) {
    const existing = seen.get(value as object);
    if (existing) {
      if (stats) {
        stats.seenReuses += 1;
      }
      return existing as T;
    }
    if (stats) {
      stats.arrays += 1;
    }
    const previousArray = Array.isArray(previous) ? previous : undefined;
    const clone: unknown[] = [];
    seen.set(value as object, clone);
    for (let index = 0; index < value.length; index += 1) {
      clone.push(cloneSessionValueWithReuse(value[index], previousArray?.[index], seen, stats));
    }
    inheritExpressionProvenance(clone, value);
    return clone as T;
  }

  if (isPlainObject(value)) {
    const existing = seen.get(value as object);
    if (existing) {
      if (stats) {
        stats.seenReuses += 1;
      }
      return existing as T;
    }
    if (stats) {
      stats.objects += 1;
    }
    const previousObject = isPlainObject(previous) ? previous as Record<string, unknown> : undefined;
    const clone: Record<string, unknown> = Object.create(Object.getPrototypeOf(value));
    seen.set(value as object, clone);
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = cloneSessionValueWithReuse(entry, previousObject?.[key], seen, stats);
    }
    inheritExpressionProvenance(clone, value);
    return clone as T;
  }

  if (stats) {
    stats.primitives += 1;
  }
  return value;
}

function describeValueType(value: unknown): string {
  const unwrapped = isStructuredValue(value) ? value.data : value;
  if (unwrapped === null) {
    return 'null';
  }
  if (Array.isArray(unwrapped)) {
    return 'array';
  }
  return typeof unwrapped;
}

function getSessionDefinitionFromVariable(variable: Variable | undefined): SessionDefinition | undefined {
  if (!variable || variable.internal?.isSessionSchema !== true) {
    return undefined;
  }
  const internalDefinition = variable.internal.sessionSchema;
  return internalDefinition ?? (variable.value as SessionDefinition);
}

export function getSessionDefinitionFromValue(value: unknown): SessionDefinition | undefined {
  if (!value) {
    return undefined;
  }
  if (isVariable(value)) {
    return getSessionDefinitionFromVariable(value);
  }
  if (
    typeof value === 'object' &&
    typeof (value as SessionDefinition).id === 'string' &&
    typeof (value as SessionDefinition).canonicalName === 'string' &&
    isPlainObject((value as SessionDefinition).slots)
  ) {
    return value as SessionDefinition;
  }
  return undefined;
}

async function resolveSessionSchemaValue(raw: unknown, env: Environment): Promise<SessionDefinition | undefined> {
  const direct = getSessionDefinitionFromValue(raw);
  if (direct) {
    return direct;
  }

  if (
    raw &&
    typeof raw === 'object' &&
    (raw as { type?: string }).type === 'VariableReference' &&
    typeof (raw as { identifier?: unknown }).identifier === 'string' &&
    (!Array.isArray((raw as { fields?: unknown[] }).fields)
      || ((raw as { fields?: unknown[] }).fields?.length ?? 0) === 0)
  ) {
    const variable = env.getVariable((raw as { identifier: string }).identifier);
    return getSessionDefinitionFromVariable(variable);
  }

  if (isAstLikeNode(raw)) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(raw as any, env, { isExpression: true });
    return getSessionDefinitionFromValue(result.value);
  }

  return undefined;
}

export async function resolveSessionSchemaReference(raw: unknown, env: Environment): Promise<SessionDefinition> {
  const resolved = await resolveSessionSchemaValue(raw, env);
  if (!resolved) {
    throw new MlldInterpreterError(
      'session must reference a declared session schema',
      'session',
      undefined,
      { code: 'INVALID_SESSION_ATTACHMENT' }
    );
  }
  return resolved;
}

export function getNormalizedSessionAttachment(env: Environment): SessionScopedAttachment | undefined {
  const scopedConfig = env.getLocalScopedEnvironmentConfig();
  if (!scopedConfig) {
    return undefined;
  }

  const sessionValue = scopedConfig.session;
  if (!sessionValue) {
    return undefined;
  }

  const definition =
    'definition' in (sessionValue as Record<string, unknown>)
      ? (sessionValue as SessionScopedAttachment).definition
      : getSessionDefinitionFromValue(sessionValue);

  if (!definition) {
    return undefined;
  }

  const seed =
    'definition' in (sessionValue as Record<string, unknown>)
      ? (sessionValue as SessionScopedAttachment).seed
      : scopedConfig.seed;

  return {
    definition,
    ...(seed !== undefined ? { seed } : {})
  };
}

export class RuntimeSessionInstance implements SessionFrameInstance {
  private readonly values = new Map<string, unknown>();
  private readonly traceValues = new Map<string, unknown>();

  constructor(
    public readonly sessionId: string,
    public readonly definition: SessionDefinition
  ) {}

  hasSlot(name: string): boolean {
    return this.values.has(name) || this.traceValues.has(name);
  }

  getSlot(name: string): unknown {
    return this.values.has(name)
      ? this.values.get(name)
      : this.traceValues.get(name);
  }

  getObservedSlot(name: string): unknown {
    if (this.traceValues.has(name)) {
      return this.traceValues.get(name);
    }
    return this.values.get(name);
  }

  setSlot(name: string, value: unknown): void {
    this.values.set(name, value);
  }

  clearSlot(name: string): void {
    this.values.delete(name);
  }

  setTraceSlot(name: string, value: unknown): void {
    this.traceValues.set(name, value);
  }

  clearTraceSlot(name: string): void {
    this.traceValues.delete(name);
  }

  hasTraceSlot(name: string): boolean {
    return this.traceValues.has(name);
  }

  getTraceSlot(name: string): unknown {
    return this.traceValues.get(name);
  }

  snapshot(): Record<string, unknown> {
    const snapshot: Record<string, unknown> = Object.create(null);
    for (const slotName of Object.keys(this.definition.slots)) {
      if (this.values.has(slotName)) {
        snapshot[slotName] = cloneSessionValue(this.values.get(slotName));
        continue;
      }
      if (this.traceValues.has(slotName)) {
        snapshot[slotName] = cloneSessionValue(this.traceValues.get(slotName));
      }
    }
    return snapshot;
  }

  traceSnapshot(): Record<string, unknown> {
    const snapshot: Record<string, unknown> = Object.create(null);
    for (const slotName of Object.keys(this.definition.slots)) {
      if (this.traceValues.has(slotName)) {
        snapshot[slotName] = cloneSessionValue(this.traceValues.get(slotName));
        continue;
      }
      if (this.values.has(slotName)) {
        snapshot[slotName] = cloneSessionValue(this.values.get(slotName));
      }
    }
    return snapshot;
  }

  observedSnapshot(): Record<string, unknown> {
    return this.traceSnapshot();
  }
}

class GuardSessionWriteBuffer implements SessionWriteBuffer {
  private readonly entries: SessionBufferedWrite[] = [];
  private completed = false;

  stage(entry: SessionBufferedWrite): void {
    if (this.completed) {
      throw new MlldInterpreterError(
        'Cannot stage a session write after the guard buffer completed',
        'session',
        undefined,
        { code: 'SESSION_BUFFER_CLOSED' }
      );
    }
    this.entries.push(entry);
  }

  commit(): void {
    if (this.completed) {
      return;
    }
    this.completed = true;
    for (const entry of this.entries) {
      entry.commit();
    }
    this.clear();
  }

  discard(): void {
    if (this.completed) {
      return;
    }
    this.completed = true;
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      this.entries[index]?.discard();
    }
    this.clear();
  }

  clear(): void {
    this.entries.length = 0;
  }

  readOverlay(path: string): { found: boolean; value?: unknown } | undefined {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index];
      if (entry?.path !== path) {
        continue;
      }
      return entry.clear
        ? { found: true, value: undefined }
        : { found: true, value: cloneSessionValue(entry.value) };
    }
    return undefined;
  }
}

export function createGuardSessionWriteBuffer(): SessionWriteBuffer {
  return new GuardSessionWriteBuffer();
}

function createSessionError(
  message: string,
  code: string
): MlldInterpreterError {
  return new MlldInterpreterError(message, 'session', undefined, { code });
}

function getSlotBinding(instance: SessionFrameInstance, slotName: string): SessionSlotBinding {
  const binding = instance.definition.slots[slotName];
  if (!binding) {
    throw createSessionError(
      `Unknown session slot '${slotName}' on @${instance.definition.canonicalName}.`,
      'UNKNOWN_SESSION_SLOT'
    );
  }
  return binding;
}

function readStoredSlotValue(
  instance: SessionFrameInstance,
  binding: SessionSlotBinding,
  env?: Environment
): unknown {
  const overlay = env?.getSessionWriteBuffer()?.readOverlay(binding.name);
  if (overlay?.found) {
    if (overlay.value !== undefined) {
      return cloneSessionValue(overlay.value);
    }
    if (binding.type.optional) {
      return undefined;
    }
    throw createSessionError(
      `Required session slot '${binding.name}' on @${instance.definition.canonicalName} is unset.`,
      'SESSION_REQUIRED_SLOT_UNSET'
    );
  }
  const observedInstance =
    instance instanceof RuntimeSessionInstance ? instance : undefined;
  if (observedInstance) {
    const observedValue = observedInstance.getObservedSlot(binding.name);
    if (observedValue !== undefined || observedInstance.hasSlot(binding.name) || observedInstance.hasTraceSlot(binding.name)) {
      return cloneSessionValue(observedValue);
    }
  }
  if (instance.hasSlot(binding.name)) {
    return cloneSessionValue(instance.getSlot(binding.name));
  }
  if (binding.type.optional) {
    return undefined;
  }
  throw createSessionError(
    `Required session slot '${binding.name}' on @${instance.definition.canonicalName} is unset.`,
    'SESSION_REQUIRED_SLOT_UNSET'
  );
}

function unwrapStructuredForValidation(value: unknown): unknown {
  return isStructuredValue(value) ? value.data : value;
}

function validatePrimitiveValue(typeName: string, value: unknown): boolean {
  const raw = unwrapStructuredForValidation(value);
  switch (typeName) {
    case 'string':
      return typeof raw === 'string';
    case 'number':
      return typeof raw === 'number' && Number.isFinite(raw);
    case 'boolean':
      return typeof raw === 'boolean';
    case 'object':
      return isPlainObject(raw);
    case 'array':
      return Array.isArray(raw);
    default:
      return false;
  }
}

function validateRecordFieldValue(
  field: RecordFieldDefinition,
  value: unknown
): boolean {
  if (value === undefined || value === null) {
    return field.optional;
  }

  if (!field.valueType) {
    return true;
  }

  const raw = unwrapStructuredForValidation(value);
  switch (field.valueType as RecordFieldValueType) {
    case 'string':
      return typeof raw === 'string';
    case 'number':
      return typeof raw === 'number' && Number.isFinite(raw);
    case 'boolean':
      return typeof raw === 'boolean';
    case 'array':
      return Array.isArray(raw);
    case 'object':
      return isPlainObject(raw);
    case 'handle':
      return (
        typeof raw === 'string'
        || isHandleWrapper(raw)
        || (isPlainObject(raw) && typeof raw.handle === 'string')
      );
    default:
      return true;
  }
}

function validateRecordValue(definition: RecordDefinition, value: unknown): boolean {
  if (isStructuredValue(value) && value.mx?.schema?.valid === true) {
    return true;
  }

  const raw = unwrapStructuredForValidation(value);
  if (definition.rootMode !== 'object') {
    return raw !== undefined;
  }

  if (!isPlainObject(raw)) {
    return false;
  }

  for (const field of definition.fields) {
    if (!Object.prototype.hasOwnProperty.call(raw, field.name)) {
      if (!field.optional) {
        return false;
      }
      continue;
    }
    if (!validateRecordFieldValue(field, raw[field.name])) {
      return false;
    }
  }

  return true;
}

function validateSlotValue(binding: SessionSlotBinding, value: unknown): void {
  const { type } = binding;
  const actual = unwrapStructuredForValidation(value);

  if (actual === undefined || actual === null) {
    if (type.optional) {
      return;
    }
    throw createSessionError(
      `Session slot '${binding.name}' expects ${describeSessionSlotType(type)} but received ${describeValueType(actual)}.`,
      'SESSION_TYPE_ERROR'
    );
  }

  if (type.isArray) {
    if (!Array.isArray(actual)) {
      throw createSessionError(
        `Session slot '${binding.name}' expects ${describeSessionSlotType(type)} but received ${describeValueType(actual)}.`,
        'SESSION_TYPE_ERROR'
      );
    }
    for (const entry of actual) {
      validateSlotElement(type, binding, entry);
    }
    return;
  }

  validateSlotElement(type, binding, value);
}

function validateSlotElement(type: SessionSlotType, binding: SessionSlotBinding, value: unknown): void {
  const ok =
    type.kind === 'primitive'
      ? validatePrimitiveValue(type.name, value)
      : validateRecordValue(type.definition, value);

  if (ok) {
    return;
  }

  throw createSessionError(
    `Session slot '${binding.name}' expects ${describeSessionSlotType(type)} but received ${describeValueType(value)}.`,
    'SESSION_TYPE_ERROR'
  );
}

function describeSessionSlotType(type: SessionSlotType): string {
  const base = type.kind === 'primitive' ? type.name : `@${type.name}`;
  return `${base}${type.isArray ? '[]' : ''}${type.optional ? '?' : ''}`;
}

function normalizePathSegment(value: unknown, methodName: string): SessionPathSegment {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw createSessionError(
        `${methodName} requires non-empty path segments.`,
        'INVALID_SESSION_PATH'
      );
    }
    return trimmed;
  }

  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  throw createSessionError(
    `${methodName} accepts only string or integer path segments.`,
    'INVALID_SESSION_PATH'
  );
}

function normalizeSessionPath(value: unknown, methodName: string): SessionPathSegment[] {
  const resolved = unwrapStructuredForValidation(value);

  if (typeof resolved === 'string') {
    const trimmed = resolved.trim();
    if (trimmed.length === 0) {
      throw createSessionError(
        `${methodName} requires a non-empty path.`,
        'INVALID_SESSION_PATH'
      );
    }
    return trimmed.split('.').map(segment => normalizePathSegment(segment, methodName));
  }

  if (Array.isArray(resolved)) {
    if (resolved.length === 0) {
      throw createSessionError(
        `${methodName} requires a non-empty path.`,
        'INVALID_SESSION_PATH'
      );
    }
    return resolved.map(segment => normalizePathSegment(segment, methodName));
  }

  throw createSessionError(
    `${methodName} requires a dotted string path or an array of path segments.`,
    'INVALID_SESSION_PATH'
  );
}

function unwrapMutableContainer(value: unknown): unknown {
  if (isStructuredValue(value) && (value.type === 'object' || value.type === 'array')) {
    return value.data;
  }
  return value;
}

function looksLikeEnvironment(value: unknown): value is Environment {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Environment).getScopedEnvironmentConfig === 'function' &&
    typeof (value as Environment).getCurrentLlmSessionId === 'function'
  );
}

function splitBoundExecutionEnv(
  args: readonly unknown[],
  fallbackEnv: Environment
): {
  executionEnv: Environment;
  invocationArgs: unknown[];
} {
  const lastArg = args[args.length - 1];
  if (looksLikeEnvironment(lastArg)) {
    return {
      executionEnv: lastArg,
      invocationArgs: args.slice(0, -1)
    };
  }

  return {
    executionEnv: fallbackEnv,
    invocationArgs: [...args]
  };
}

async function getSessionObjectUpdates(
  value: unknown,
  env: Environment
): Promise<Record<string, unknown> | undefined> {
  const resolved = unwrapStructuredForValidation(value);
  if (!isPlainObject(resolved)) {
    return undefined;
  }

  const keys = Object.keys(resolved);
  if (keys.length === 0) {
    return {};
  }

  const { accessFields } = await import('@interpreter/utils/field-access');
  const updates: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    updates[key] = await accessFields(
      value,
      [{ type: 'field', value: key } as any],
      {
        env,
        preserveContext: false,
        returnUndefinedForMissing: true
      }
    );
  }

  return updates;
}

function readNestedPathValue(
  rootValue: unknown,
  pathSegments: readonly SessionPathSegment[],
  pathLabel: string
): unknown {
  let current: unknown = rootValue;

  for (const segment of pathSegments) {
    const container = unwrapMutableContainer(current);
    if (Array.isArray(container)) {
      if (typeof segment !== 'number') {
        throw createSessionError(
          `Session path '${pathLabel}' indexes an array with a non-numeric segment.`,
          'INVALID_SESSION_PATH'
        );
      }
      current = container[segment];
      continue;
    }

    if (isPlainObject(container)) {
      current = container[String(segment)];
      continue;
    }

    throw createSessionError(
      `Session path '${pathLabel}' cannot traverse ${describeValueType(container)}.`,
      'INVALID_SESSION_PATH'
    );
  }

  return cloneSessionValue(current);
}

function writeNestedPathValue(
  rootValue: unknown,
  pathSegments: readonly SessionPathSegment[],
  nextValue: unknown,
  pathLabel: string
): unknown {
  if (pathSegments.length === 0) {
    return cloneSessionValue(nextValue);
  }

  const rootClone = cloneSessionValue(rootValue);
  let current: unknown = rootClone;

  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const segment = pathSegments[index];
    const container = unwrapMutableContainer(current);

    if (Array.isArray(container)) {
      if (typeof segment !== 'number') {
        throw createSessionError(
          `Session path '${pathLabel}' indexes an array with a non-numeric segment.`,
          'INVALID_SESSION_PATH'
        );
      }
      if (segment < 0 || segment >= container.length) {
        throw createSessionError(
          `Session path '${pathLabel}' indexes array position ${segment} outside the current bounds.`,
          'INVALID_SESSION_PATH'
        );
      }
      current = container[segment];
      continue;
    }

    if (isPlainObject(container)) {
      const key = String(segment);
      if (!Object.prototype.hasOwnProperty.call(container, key) || container[key] === undefined) {
        throw createSessionError(
          `Session path '${pathLabel}' cannot traverse through unset key '${key}'.`,
          'INVALID_SESSION_PATH'
        );
      }
      current = container[key];
      continue;
    }

    throw createSessionError(
      `Session path '${pathLabel}' cannot traverse ${describeValueType(container)}.`,
      'INVALID_SESSION_PATH'
    );
  }

  const lastSegment = pathSegments[pathSegments.length - 1]!;
  const parentContainer = unwrapMutableContainer(current);

  if (Array.isArray(parentContainer)) {
    if (typeof lastSegment !== 'number') {
      throw createSessionError(
        `Session path '${pathLabel}' indexes an array with a non-numeric segment.`,
        'INVALID_SESSION_PATH'
      );
    }
    if (lastSegment < 0 || lastSegment >= parentContainer.length) {
      throw createSessionError(
        `Session path '${pathLabel}' indexes array position ${lastSegment} outside the current bounds.`,
        'INVALID_SESSION_PATH'
      );
    }
    parentContainer[lastSegment] = cloneSessionValue(nextValue);
    return rootClone;
  }

  if (isPlainObject(parentContainer)) {
    parentContainer[String(lastSegment)] = cloneSessionValue(nextValue);
    return rootClone;
  }

  throw createSessionError(
    `Session path '${pathLabel}' cannot write into ${describeValueType(parentContainer)}.`,
    'INVALID_SESSION_PATH'
  );
}

function stageMutation(
  env: Environment,
  state: PendingMutationState
): void {
  const buffer = env.getSessionWriteBuffer();
  if (!buffer) {
    state.commitWrite();
    return;
  }

  buffer.stage({
    path: state.path,
    value: state.clear ? undefined : cloneSessionValue(state.nextValue),
    clear: state.clear,
    commit: () => {
      state.commitWrite();
    },
    discard: () => {
      if (state.hadPrevious) {
        state.instance.setSlot(state.slotName, cloneSessionValue(state.previousValue));
      } else {
        state.instance.clearSlot(state.slotName);
      }
      if (state.hadPreviousTrace) {
        state.instance.setTraceSlot(state.slotName, cloneSessionValue(state.previousTraceValue));
      } else {
        state.instance.clearTraceSlot(state.slotName);
      }
    }
  });
}

function recordCommittedSessionWrite(args: {
  env: Environment;
  instance: SessionFrameInstance;
  path: string;
  operation: SessionWriteOperation;
  previousValue: unknown;
  nextValue: unknown;
}): void {
  args.env.recordSessionWrite({
    sessionId: args.instance.sessionId,
    declarationId: args.instance.definition.id,
    sessionName: args.instance.definition.canonicalName,
    originPath: args.instance.definition.originPath,
    path: args.path,
    operation: args.operation
  });
  if (args.env.shouldEmitRuntimeTrace('effects', 'session')) {
    const traceEnvelope = args.operation === 'seed'
      ? buildSessionSeedTraceEnvelope({
          env: args.env,
          frameId: args.instance.sessionId,
          definition: args.instance.definition,
          path: args.path,
          nextValue: args.nextValue
        })
      : buildSessionWriteTraceEnvelope({
          env: args.env,
          frameId: args.instance.sessionId,
          definition: args.instance.definition,
          path: args.path,
          operation: args.operation,
          previousValue: args.previousValue,
          nextValue: args.nextValue
        });
    args.env.emitRuntimeTraceEvent(traceEnvelope);
  }
  args.env.emitRuntimeMemoryTrace('session.write', 'finish', {
    requiredLevel: 'verbose',
    data: {
      sessionName: args.instance.definition.canonicalName,
      operation: args.operation,
      path: args.path,
      ...buildSessionWriteMemoryTraceData(args.env, args.previousValue, args.nextValue)
    }
  });
  if (args.env.hasSDKEmitter()) {
    args.env.emitSDKEvent({
      type: 'session_write',
      session_write: buildSessionWriteSdkPayload({
        env: args.env,
        definition: args.instance.definition,
        frameId: args.instance.sessionId,
        path: args.path,
        operation: args.operation,
        previousValue: args.previousValue,
        nextValue: args.nextValue
      }),
      timestamp: Date.now()
    });
  }
}

function buildSessionWriteMemoryTraceData(
  env: Environment,
  previousValue: unknown,
  nextValue: unknown
): Record<string, unknown> {
  if (!env.isRuntimeMemoryTraceEnabled()) {
    return {};
  }

  const previousBytes = estimateRuntimeTraceValueBytes(previousValue) ?? 0;
  const valueBytes = estimateRuntimeTraceValueBytes(nextValue) ?? 0;
  return {
    previousBytes,
    previousHuman: formatRuntimeTraceSize(previousBytes),
    valueBytes,
    valueHuman: formatRuntimeTraceSize(valueBytes)
  };
}

function applySlotMutation(args: {
  env: Environment;
  instance: RuntimeSessionInstance;
  binding: SessionSlotBinding;
  nextValue: unknown;
  operation: SessionWriteOperation;
  path: string;
  clear?: boolean;
}): unknown {
  if (!args.clear) {
    validateSlotValue(args.binding, args.nextValue);
  }

  args.env.clearSessionFrameSnapshotCache(args.instance.sessionId);
  const buffer = args.env.getSessionWriteBuffer();
  const hadPrevious = args.instance.hasSlot(args.binding.name);
  const previousValue = hadPrevious
    ? (buffer ? cloneSessionValue(args.instance.getSlot(args.binding.name)) : args.instance.getSlot(args.binding.name))
    : undefined;
  const hadPreviousTrace = args.instance.hasTraceSlot(args.binding.name);
  const previousTraceValue = hadPreviousTrace
    ? (buffer ? cloneSessionValue(args.instance.getTraceSlot(args.binding.name)) : args.instance.getTraceSlot(args.binding.name))
    : undefined;

  if (args.clear) {
    args.instance.clearSlot(args.binding.name);
    args.instance.clearTraceSlot(args.binding.name);
  } else {
    args.instance.clearSlot(args.binding.name);
    const previousObservedValue = hadPreviousTrace
      ? previousTraceValue
      : (hadPrevious ? previousValue : undefined);
    const cloneStats = args.env.isRuntimeMemoryTraceEnabled()
      ? createSessionCloneStats()
      : undefined;
    const cloneStartedAt = cloneStats ? process.hrtime.bigint() : undefined;
    if (cloneStats) {
      args.env.emitRuntimeMemoryTrace('session.clone', 'start', {
        requiredLevel: 'verbose',
        data: {
          sessionName: args.instance.definition.canonicalName,
          operation: args.operation,
          path: args.path,
          slot: args.binding.name,
          mode: 'observed'
        }
      });
    }
    const observedClone = cloneSessionValueWithReuse(
      args.nextValue,
      previousObservedValue,
      new WeakMap(),
      cloneStats
    );
    args.instance.setTraceSlot(args.binding.name, observedClone);
    if (cloneStats && cloneStartedAt) {
      const durationMs = Number(process.hrtime.bigint() - cloneStartedAt) / 1_000_000;
      args.env.emitRuntimeMemoryTrace('session.clone', 'finish', {
        requiredLevel: 'verbose',
        data: {
          sessionName: args.instance.definition.canonicalName,
          operation: args.operation,
          path: args.path,
          slot: args.binding.name,
          mode: 'observed',
          durationMs,
          ...sessionCloneStatsData(cloneStats)
        }
      });
    }
  }

  stageMutation(args.env, {
    instance: args.instance,
    slotName: args.binding.name,
    path: args.path,
    hadPrevious,
    previousValue,
    hadPreviousTrace,
    previousTraceValue,
    nextValue: args.nextValue,
    clear: Boolean(args.clear),
    commitWrite: () => {
      recordCommittedSessionWrite({
        env: args.env,
        instance: args.instance,
        path: args.path,
        operation: args.operation,
        previousValue,
        nextValue: args.clear ? undefined : args.nextValue
      });
    }
  });

  return args.clear ? undefined : cloneSessionValue(args.nextValue);
}

async function materializeSeedInput(rawSeed: unknown, env: Environment): Promise<unknown> {
  if (isVariable(rawSeed)) {
    return extractVariableValue(rawSeed, env);
  }

  if (isAstLikeNode(rawSeed)) {
    const { evaluate } = await import('@interpreter/core/interpreter');
    const result = await evaluate(rawSeed as any, env, { isExpression: true });
    return result.value;
  }

  return rawSeed;
}

async function setSlotValues(
  instance: RuntimeSessionInstance,
  updates: Record<string, unknown>,
  env: Environment,
  operation: 'seed' | 'set'
): Promise<Record<string, unknown>> {
  const written: Record<string, unknown> = Object.create(null);

  for (const [slotName, nextValue] of Object.entries(updates)) {
    const binding = getSlotBinding(instance, slotName);
    written[slotName] = applySlotMutation({
      env,
      instance,
      binding,
      nextValue,
      operation,
      path: slotName
    });
  }

  return written;
}

function getStoredSlotForPath(
  instance: RuntimeSessionInstance,
  path: readonly SessionPathSegment[],
  methodName: string
): { binding: SessionSlotBinding; slotValue: unknown; pathLabel: string } {
  if (path.length === 0) {
    throw createSessionError(
      `${methodName} requires a non-empty path.`,
      'INVALID_SESSION_PATH'
    );
  }

  const slotName = String(path[0]);
  const binding = getSlotBinding(instance, slotName);
  const pathLabel = path.map(String).join('.');

  if (path.length === 1) {
    const slotValue = instance.hasSlot(slotName) ? instance.getSlot(slotName) : undefined;
    return { binding, slotValue, pathLabel };
  }

  if (!instance.hasSlot(slotName)) {
    throw createSessionError(
      `Session path '${pathLabel}' cannot traverse an unset slot.`,
      'INVALID_SESSION_PATH'
    );
  }

  return {
    binding,
    slotValue: instance.getSlot(slotName),
    pathLabel
  };
}

function writeSessionPath(
  instance: RuntimeSessionInstance,
  rawPath: unknown,
  nextValue: unknown,
  env: Environment,
  operation: SessionWriteOperation = 'write'
): unknown {
  const path = normalizeSessionPath(rawPath, '@session.write');
  const { binding, slotValue, pathLabel } = getStoredSlotForPath(instance, path, '@session.write');

  if (path.length === 1) {
    return applySlotMutation({
      env,
      instance,
      binding,
      nextValue,
      operation,
      path: pathLabel
    });
  }

  const nextSlotValue = writeNestedPathValue(slotValue, path.slice(1), nextValue, pathLabel);
  return applySlotMutation({
    env,
    instance,
    binding,
    nextValue: nextSlotValue,
    operation,
    path: pathLabel
  });
}

function appendSessionPath(
  instance: RuntimeSessionInstance,
  rawPath: unknown,
  appendValue: unknown,
  env: Environment
): unknown {
  const path = normalizeSessionPath(rawPath, '@session.append');
  const { binding, slotValue, pathLabel } = getStoredSlotForPath(instance, path, '@session.append');

  if (path.length === 1) {
    const base = slotValue === undefined ? [] : unwrapStructuredForValidation(slotValue);
    if (!Array.isArray(base)) {
      throw createSessionError(
        `Session path '${pathLabel}' must resolve to an array before append.`,
        'SESSION_TYPE_ERROR'
      );
    }
    const next = [...base, cloneSessionValue(appendValue)];
    return applySlotMutation({
      env,
      instance,
      binding,
      nextValue: next,
      operation: 'append',
      path: pathLabel
    });
  }

  const currentLeaf = readNestedPathValue(slotValue, path.slice(1), pathLabel);
  const base = currentLeaf === undefined ? [] : unwrapStructuredForValidation(currentLeaf);
  if (!Array.isArray(base)) {
    throw createSessionError(
      `Session path '${pathLabel}' must resolve to an array before append.`,
      'SESSION_TYPE_ERROR'
    );
  }
  const nextLeaf = [...base, cloneSessionValue(appendValue)];
  const nextSlotValue = writeNestedPathValue(slotValue, path.slice(1), nextLeaf, pathLabel);
  return applySlotMutation({
    env,
    instance,
    binding,
    nextValue: nextSlotValue,
    operation: 'append',
    path: pathLabel
  });
}

function incrementSessionPath(
  instance: RuntimeSessionInstance,
  rawPath: unknown,
  rawDelta: unknown,
  env: Environment
): unknown {
  const path = normalizeSessionPath(rawPath, '@session.increment');
  const deltaValue = rawDelta === undefined ? 1 : unwrapStructuredForValidation(rawDelta);
  if (typeof deltaValue !== 'number' || !Number.isFinite(deltaValue)) {
    throw createSessionError(
      '@session.increment delta must be a finite number.',
      'SESSION_TYPE_ERROR'
    );
  }

  const { binding, slotValue, pathLabel } = getStoredSlotForPath(instance, path, '@session.increment');

  if (path.length === 1) {
    const base = slotValue === undefined ? 0 : unwrapStructuredForValidation(slotValue);
    if (typeof base !== 'number' || !Number.isFinite(base)) {
      throw createSessionError(
        `Session path '${pathLabel}' must resolve to a number before increment.`,
        'SESSION_TYPE_ERROR'
      );
    }
    return applySlotMutation({
      env,
      instance,
      binding,
      nextValue: base + deltaValue,
      operation: 'increment',
      path: pathLabel
    });
  }

  const currentLeaf = readNestedPathValue(slotValue, path.slice(1), pathLabel);
  const base = currentLeaf === undefined ? 0 : unwrapStructuredForValidation(currentLeaf);
  if (typeof base !== 'number' || !Number.isFinite(base)) {
    throw createSessionError(
      `Session path '${pathLabel}' must resolve to a number before increment.`,
      'SESSION_TYPE_ERROR'
    );
  }
  const nextLeaf = base + deltaValue;
  const nextSlotValue = writeNestedPathValue(slotValue, path.slice(1), nextLeaf, pathLabel);
  return applySlotMutation({
    env,
    instance,
    binding,
    nextValue: nextSlotValue,
    operation: 'increment',
    path: pathLabel
  });
}

function clearSessionSlot(
  instance: RuntimeSessionInstance,
  rawSlot: unknown,
  env: Environment
): undefined {
  const path = normalizeSessionPath(rawSlot, '@session.clear');
  if (path.length !== 1) {
    throw createSessionError(
      '@session.clear only accepts a slot name.',
      'INVALID_SESSION_PATH'
    );
  }
  const binding = getSlotBinding(instance, String(path[0]));
  applySlotMutation({
    env,
    instance,
    binding,
    nextValue: undefined,
    operation: 'clear',
    path: binding.name,
    clear: true
  });
  return undefined;
}

function isAllowedSessionUpdateExecutable(variable: Variable): boolean {
  if (!isExecutableVariable(variable)) {
    return false;
  }
  if (Array.isArray(variable.mx?.labels) && variable.mx.labels.includes('llm')) {
    return false;
  }
  const definition = (variable.internal?.executableDef ?? variable.value);
  if (!definition) {
    return false;
  }
  if (isCodeExecutable(definition)) {
    const language = definition.language?.toLowerCase();
    return language === 'js' || language === 'javascript' || language === 'node' || language === 'nodejs';
  }
  return isDataExecutable(definition);
}

async function updateSessionPath(
  instance: RuntimeSessionInstance,
  rawPath: unknown,
  updater: unknown,
  env: Environment
): Promise<unknown> {
  if (!isVariable(updater) || !isExecutableVariable(updater) || !isAllowedSessionUpdateExecutable(updater)) {
    throw createSessionError(
      '@session.update requires a pure local executable (js, node, or mlld data/when executable).',
      'INVALID_SESSION_UPDATE_EXECUTABLE'
    );
  }

  const path = normalizeSessionPath(rawPath, '@session.update');
  const { binding, slotValue, pathLabel } = getStoredSlotForPath(instance, path, '@session.update');
  const currentValue =
    path.length === 1
      ? (slotValue === undefined ? undefined : cloneSessionValue(slotValue))
      : readNestedPathValue(slotValue, path.slice(1), pathLabel);

  const existingUpdater = env.getVariable(updater.name);
  const tempUpdaterName =
    typeof updater.name === 'string' && updater.name.trim().length > 0
      ? `__session_update_${updater.name}_${Date.now().toString(36)}`
      : `__session_update_${Date.now().toString(36)}`;
  const invocationName = existingUpdater === updater ? updater.name : tempUpdaterName;
  const updateEnv = existingUpdater === updater ? env : env.createChild();
  if (updateEnv !== env) {
    updateEnv.setVariable(invocationName, {
      ...updater,
      name: invocationName
    });
  }

  const { evaluateExecInvocation } = await import('@interpreter/eval/exec-invocation');
  const result = await evaluateExecInvocation({
    type: 'ExecInvocation',
    commandRef: {
      identifier: invocationName,
      args: [currentValue]
    }
  } as any, updateEnv);
  const nextLeaf = result.value;

  if (path.length === 1) {
    return applySlotMutation({
      env,
      instance,
      binding,
      nextValue: nextLeaf,
      operation: 'update',
      path: pathLabel
    });
  }

  const nextSlotValue = writeNestedPathValue(slotValue, path.slice(1), nextLeaf, pathLabel);
  return applySlotMutation({
    env,
    instance,
    binding,
    nextValue: nextSlotValue,
    operation: 'update',
    path: pathLabel
  });
}

function createSessionMethodExecutable(
  name: string,
  definition: SessionDefinition,
  executable: NodeFunctionExecutable
): Variable {
  const variable = createExecutableVariable(name, executable, {
    internal: {
      executableDef: executable,
      preserveStructuredArgs: true,
      ...(name === 'set' ? { disableNamedObjectSpread: true } : {}),
      isReserved: true,
      isSystem: true,
      strictFieldAccess: true,
      sessionDefinition: definition
    }
  });
  (variable as Variable & { paramNames?: string[]; description?: string }).paramNames = [
    ...(executable.paramNames ?? [])
  ];
  if (typeof executable.description === 'string') {
    (variable as Variable & { description?: string }).description = executable.description;
  }
  return variable;
}

function createSessionAccessorValue(
  instance: RuntimeSessionInstance,
  env: Environment
): Record<string, unknown> {
  const value = Object.create(null) as Record<string, unknown>;
  const slotNames = Object.keys(instance.definition.slots);

  for (const slotName of slotNames) {
    const binding = instance.definition.slots[slotName]!;
    Object.defineProperty(value, slotName, {
      enumerable: true,
      configurable: true,
      get: () => readStoredSlotValue(instance, binding, env)
    });
  }

  const setDefinition = markExecutableDefinition({
    type: 'nodeFunction',
    name: 'set',
    fn: async (...args: unknown[]) => {
      const { executionEnv, invocationArgs } = splitBoundExecutionEnv(args, env);
      if (executionEnv.isRuntimeMemoryTraceEnabled()) {
        executionEnv.emitRuntimeMemoryTrace('session.set', 'start', {
          requiredLevel: 'verbose',
          data: {
            sessionName: instance.definition.canonicalName,
            argCount: invocationArgs.length
          }
        });
      }
      const objectUpdates =
        invocationArgs.length === 1
          ? await getSessionObjectUpdates(invocationArgs[0], executionEnv)
          : undefined;
      if (executionEnv.isRuntimeMemoryTraceEnabled() && invocationArgs.length === 1) {
        executionEnv.emitRuntimeMemoryTrace('session.set.object_updates', 'finish', {
          requiredLevel: 'verbose',
          data: {
            sessionName: instance.definition.canonicalName,
            objectUpdateCount: objectUpdates ? Object.keys(objectUpdates).length : 0,
            objectUpdateMode: objectUpdates ? 'object' : 'positional'
          }
        });
      }
      const updateEntries = objectUpdates
        ? Object.entries(objectUpdates).filter((entry): entry is [string, unknown] => entry[1] !== undefined)
        : slotNames
            .map((slotName, index) => [slotName, invocationArgs[index]] as const)
            .filter((entry): entry is readonly [string, unknown] => entry[1] !== undefined);
      if (updateEntries.length === 0) {
        throw createSessionError('@session.set requires at least one named slot argument.', 'INVALID_SESSION_SET');
      }
      const result = await setSlotValues(
        instance,
        Object.fromEntries(updateEntries),
        executionEnv,
        'set'
      );
      if (executionEnv.isRuntimeMemoryTraceEnabled()) {
        executionEnv.emitRuntimeMemoryTrace('session.set', 'finish', {
          requiredLevel: 'verbose',
          data: {
            sessionName: instance.definition.canonicalName,
            writtenCount: updateEntries.length
          }
        });
      }
      return result;
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: slotNames,
    optionalParams: slotNames,
    description: `Write one or more session slots on @${instance.definition.canonicalName}.`
  } satisfies NodeFunctionExecutable);

  const writeDefinition = markExecutableDefinition({
    type: 'nodeFunction',
    name: 'write',
    fn: async (...args: unknown[]) => {
      const { executionEnv, invocationArgs } = splitBoundExecutionEnv(args, env);
      const [path, nextValue] = invocationArgs;
      return writeSessionPath(instance, path, nextValue, executionEnv);
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['path', 'value'],
    description: `Write a session path on @${instance.definition.canonicalName}.`
  } satisfies NodeFunctionExecutable);

  const updateDefinition = markExecutableDefinition({
    type: 'nodeFunction',
    name: 'update',
    fn: async (...args: unknown[]) => {
      const { executionEnv, invocationArgs } = splitBoundExecutionEnv(args, env);
      const [path, updater] = invocationArgs;
      return updateSessionPath(instance, path, updater, executionEnv);
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['path', 'fn'],
    description: `Atomically update a session path on @${instance.definition.canonicalName}.`
  } satisfies NodeFunctionExecutable);

  const appendDefinition = markExecutableDefinition({
    type: 'nodeFunction',
    name: 'append',
    fn: async (...args: unknown[]) => {
      const { executionEnv, invocationArgs } = splitBoundExecutionEnv(args, env);
      const [path, nextValue] = invocationArgs;
      return appendSessionPath(instance, path, nextValue, executionEnv);
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['path', 'value'],
    description: `Append to an array session path on @${instance.definition.canonicalName}.`
  } satisfies NodeFunctionExecutable);

  const incrementDefinition = markExecutableDefinition({
    type: 'nodeFunction',
    name: 'increment',
    fn: async (...args: unknown[]) => {
      const { executionEnv, invocationArgs } = splitBoundExecutionEnv(args, env);
      const [path, delta] = invocationArgs;
      return incrementSessionPath(instance, path, delta, executionEnv);
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['path', 'delta'],
    optionalParams: ['delta'],
    description: `Increment a numeric session path on @${instance.definition.canonicalName}.`
  } satisfies NodeFunctionExecutable);

  const clearDefinition = markExecutableDefinition({
    type: 'nodeFunction',
    name: 'clear',
    fn: async (...args: unknown[]) => {
      const { executionEnv, invocationArgs } = splitBoundExecutionEnv(args, env);
      const [slot] = invocationArgs;
      return clearSessionSlot(instance, slot, executionEnv);
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['slot'],
    description: `Clear a session slot on @${instance.definition.canonicalName}.`
  } satisfies NodeFunctionExecutable);

  value.set = createSessionMethodExecutable('set', instance.definition, setDefinition);
  value.write = createSessionMethodExecutable('write', instance.definition, writeDefinition);
  value.update = createSessionMethodExecutable('update', instance.definition, updateDefinition);
  value.append = createSessionMethodExecutable('append', instance.definition, appendDefinition);
  value.increment = createSessionMethodExecutable('increment', instance.definition, incrementDefinition);
  value.clear = createSessionMethodExecutable('clear', instance.definition, clearDefinition);

  return value;
}

export function resolveAttachedSessionInstance(
  definition: SessionDefinition,
  env: Environment
): RuntimeSessionInstance | undefined {
  const sessionId = env.getCurrentLlmSessionId();
  if (sessionId) {
    const direct = env.getSessionInstance(sessionId, definition.id) as RuntimeSessionInstance | undefined;
    if (direct) {
      return direct;
    }
  }
  return env.findSessionInstanceByDefinition(definition.id) as RuntimeSessionInstance | undefined;
}

export function requireAttachedSessionInstance(
  definition: SessionDefinition,
  env: Environment
): RuntimeSessionInstance {
  const instance = resolveAttachedSessionInstance(definition, env);
  if (instance) {
    return instance;
  }

  const sessionId = env.getCurrentLlmSessionId();
  throw createSessionError(
    sessionId
      ? `Session @${definition.canonicalName} is not attached to the current frame.`
      : `Session @${definition.canonicalName} is only live inside an attached LLM frame.`,
    'SESSION_NOT_ATTACHED'
  );
}

export function createSessionAccessorVariable(
  name: string,
  definition: SessionDefinition,
  env: Environment
): Variable {
  const instance = requireAttachedSessionInstance(definition, env);
  return createObjectVariable(
    name,
    createSessionAccessorValue(instance, env),
    false,
    SESSION_VARIABLE_SOURCE,
    {
      internal: {
        isReserved: true,
        strictFieldAccess: true,
        sessionDefinition: definition,
        sessionAccessor: true
      }
    }
  );
}

export function createSessionSnapshot(
  definition: SessionDefinition,
  env: Environment
): Record<string, unknown> {
  const instance = requireAttachedSessionInstance(definition, env);
  return instance.observedSnapshot();
}

export function createSessionSnapshotVariable(
  name: string,
  definition: SessionDefinition,
  env: Environment
): Variable {
  return createSessionSnapshotVariableFromState(
    name,
    definition,
    createSessionSnapshot(definition, env)
  );
}

export function createSessionSnapshotVariableFromState(
  name: string,
  definition: SessionDefinition,
  finalState: Record<string, unknown>
): Variable {
  return createObjectVariable(name, cloneSessionValue(finalState), false, SESSION_VARIABLE_SOURCE, {
    internal: {
      strictFieldAccess: true,
      sessionDefinition: definition,
      sessionSnapshot: true
    }
  });
}

export function materializeSession(
  definition: SessionDefinition,
  _env: Environment,
  sessionId: string
): RuntimeSessionInstance {
  return new RuntimeSessionInstance(sessionId, definition);
}

export function snapshotSessionsForFrame(
  sessionId: string,
  env: Environment
): SessionFinalStateMap | undefined {
  const cached = env.getCachedSessionFrameSnapshot(sessionId) as SessionFinalStateMap | undefined;
  if (cached) {
    return cached;
  }

  const instances = env.getSessionInstancesForFrame(sessionId);
  if (instances.length === 0) {
    return undefined;
  }

  const snapshots: SessionFinalStateMap = Object.create(null);
  for (const instance of instances) {
    snapshots[instance.definition.canonicalName] =
      instance instanceof RuntimeSessionInstance
        ? instance.observedSnapshot()
        : instance.snapshot();
  }

  env.cacheSessionFrameSnapshot(sessionId, snapshots);
  return snapshots;
}

export async function applySeedWrites(
  instance: RuntimeSessionInstance,
  rawSeed: unknown,
  env: Environment
): Promise<void> {
  if (rawSeed === undefined) {
    return;
  }

  const seedInputs = Array.isArray(rawSeed) ? rawSeed : [rawSeed];
  for (const seedInput of seedInputs) {
    if (seedInput === undefined) {
      continue;
    }
    const resolvedSeed = await materializeSeedInput(seedInput, env);
    if (resolvedSeed === undefined || resolvedSeed === null) {
      continue;
    }
    if (!isPlainObject(resolvedSeed)) {
      throw createSessionError('seed must evaluate to an object keyed by session slot name.', 'INVALID_SESSION_SEED');
    }
    const seedUpdates = await getSessionObjectUpdates(resolvedSeed, env);
    await setSlotValues(instance, seedUpdates ?? resolvedSeed, env, 'seed');
  }
}

export function disposeSessionFrame(sessionId: string, env: Environment): void {
  const cachedSnapshots = env.getCachedSessionFrameSnapshot(sessionId) as SessionFinalStateMap | undefined;
  for (const instance of env.getSessionInstancesForFrame(sessionId)) {
    const finalState =
      cachedSnapshots?.[instance.definition.canonicalName]
        ?? (instance instanceof RuntimeSessionInstance
          ? instance.observedSnapshot()
          : instance.snapshot());
    env.recordCompletedSession({
      frameId: sessionId,
      declarationId: instance.definition.id,
      name: instance.definition.canonicalName,
      originPath: instance.definition.originPath,
      finalState
    });
    if (env.shouldEmitRuntimeTrace('effects', 'session')) {
      env.emitRuntimeTraceEvent(buildSessionFinalTraceEnvelope({
        env,
        frameId: sessionId,
        definition: instance.definition,
        finalState
      }));
    }
    env.emitRuntimeMemoryTrace('session.final', 'finish', {
      data: {
        sessionName: instance.definition.canonicalName
      }
    });
  }
  env.clearSessionFrameSnapshotCache(sessionId);
  env.disposeSessionInstances(sessionId);
}

export function emitAttachedSessionFinalSnapshot(env: Environment): void {
  const currentSessionId = env.getCurrentLlmSessionId();
  const sessionIds = currentSessionId
    ? [currentSessionId]
    : (() => {
        const attachedFrameIds = env.getAttachedSessionFrameIds();
        return attachedFrameIds.length === 1 ? attachedFrameIds : [];
      })();

  for (const sessionId of sessionIds) {
    for (const instance of env.getSessionInstancesForFrame(sessionId)) {
      if (!env.shouldEmitRuntimeTrace('effects', 'session')) {
        continue;
      }
      const traceFinalState =
        instance instanceof RuntimeSessionInstance
          ? instance.traceSnapshot()
          : instance.snapshot();
      env.emitRuntimeTraceEvent(buildSessionFinalTraceEnvelope({
        env,
        frameId: sessionId,
        definition: instance.definition,
        finalState: traceFinalState
      }));
    }
  }
}

export function mergeSessionScopedConfig(args: {
  baseConfig?: EnvironmentConfig;
  definition: SessionDefinition;
  seed?: unknown;
}): EnvironmentConfig {
  const { baseConfig, definition, seed } = args;
  return {
    ...(baseConfig ?? {}),
    session: {
      definition,
      ...(seed !== undefined ? { seed } : {})
    },
    ...(seed !== undefined ? { seed } : {})
  };
}
