import * as yaml from 'js-yaml';
import { randomUUID } from 'node:crypto';
import type { Environment } from '@interpreter/env/Environment';
import {
  createStructuredValueVariable,
  type Variable,
  type VariableSource
} from '@core/types/variable';
import { MlldInterpreterError } from '@core/errors';
import type {
  RecordDataTrustLevel,
  RecordDefinition,
  RecordFieldDefinition,
  RecordFieldProjectionMetadata,
  RecordObjectProjectionMetadata,
  RecordSchemaMetadata,
  RecordValidationError,
  RecordWhenCondition,
  RecordWhenRule
} from '@core/types/record';
import {
  createFactSourceHandle,
  isHandleWrapper,
  type FactSourceHandle
} from '@core/types/handle';
import {
  makeSecurityDescriptor,
  mergeDescriptors,
  removeLabelsFromDescriptor,
  serializeSecurityDescriptor,
  type SecurityDescriptor
} from '@core/types/security';
import {
  applySecurityDescriptorToStructuredValue,
  asText,
  extractSecurityDescriptor,
  isStructuredValue,
  wrapStructured,
  type StructuredValue
} from '@interpreter/utils/structured-value';
import {
  encodeCanonicalValue,
  encodeDisplayInstanceKey
} from '@interpreter/security/canonical-value';
import { evaluateDataValue } from '@interpreter/eval/data-value-evaluator';
import { extractProjectedHandleToken } from '@interpreter/utils/handle-resolution';
import { isVariable } from '@interpreter/utils/variable-resolution';

type NamespaceFieldMetadata = {
  security?: ReturnType<typeof serializeSecurityDescriptor>;
  factsources?: readonly FactSourceHandle[];
  projection?: RecordFieldProjectionMetadata;
};

type RecordObjectResult = {
  value: StructuredValue<Record<string, unknown>>;
  errors: RecordValidationError[];
  factsources: FactSourceHandle[];
};

type RecordRootContext = {
  input: unknown;
  key?: unknown;
  value?: unknown;
};

type RecordCoercionIdentity = {
  coercionId: string;
  position: number;
};

type ResolvedRecordWhen = {
  tiers: string[];
  demote: boolean;
  dataTrustOverrides: Record<string, RecordDataTrustLevel>;
};

type RecordWhenBindings = {
  input: unknown;
  key?: unknown;
  value?: unknown;
};

const RECORD_INPUT_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'reference',
  hasInterpolation: false,
  isMultiLine: false
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function createRecordError(
  definition: RecordDefinition,
  message: string,
  code: string
): MlldInterpreterError {
  return new MlldInterpreterError(message, 'record', definition.location, { code });
}

function buildSchemaMetadata(
  definition: RecordDefinition,
  errors: RecordValidationError[]
): RecordSchemaMetadata {
  return {
    valid: errors.length === 0,
    errors,
    mode: definition.validate
  };
}

function dedupeFactSources(factsources: readonly FactSourceHandle[]): FactSourceHandle[] {
  const unique = new Map<string, FactSourceHandle>();
  for (const handle of factsources) {
    unique.set(JSON.stringify(handle), handle);
  }
  return Array.from(unique.values());
}

function setStructuredMetadata(
  value: StructuredValue,
  schema: RecordSchemaMetadata,
  factsources: readonly FactSourceHandle[]
): void {
  const deduped = dedupeFactSources(factsources);
  value.metadata = {
    ...(value.metadata ?? {}),
    schema,
    factsources: deduped
  };
  value.mx.schema = schema;
  value.mx.factsources = deduped;
}

function getRecordInstanceKey(
  definition: RecordDefinition,
  shaped: Readonly<Record<string, unknown>>
): string | undefined {
  if (!definition.key || !Object.prototype.hasOwnProperty.call(shaped, definition.key)) {
    return undefined;
  }
  return encodeDisplayInstanceKey(shaped[definition.key]);
}

function hasDescriptorLabel(
  descriptor: SecurityDescriptor | undefined,
  label: string
): boolean {
  if (!descriptor) {
    return false;
  }
  return descriptor.labels.includes(label) || descriptor.taint.includes(label);
}

function sanitizeRecordWrapperDescriptor(
  descriptor: SecurityDescriptor | undefined
): SecurityDescriptor | undefined {
  return removeLabelsFromDescriptor(descriptor, ['untrusted']);
}

function buildRecordFieldDescriptor(options: {
  inheritedDescriptor?: SecurityDescriptor;
  factLabels?: readonly string[];
  shouldKeepUntrusted: boolean;
}): SecurityDescriptor | undefined {
  const labels = options.factLabels ? [...options.factLabels] : [];
  const taint: string[] = [];

  if (options.shouldKeepUntrusted && hasDescriptorLabel(options.inheritedDescriptor, 'untrusted')) {
    labels.push('untrusted');
    taint.push('untrusted');
  }

  if (labels.length === 0 && taint.length === 0) {
    return undefined;
  }

  return makeSecurityDescriptor({ labels, taint });
}

function buildRecordObjectProjectionMetadata(
  definition: RecordDefinition
): RecordObjectProjectionMetadata {
  return {
    kind: 'record',
    recordName: definition.name,
    display: definition.display,
    fields: Object.fromEntries(
      definition.fields.map(field => [
        field.name,
        {
          classification: field.classification
        }
      ])
    )
  };
}

function buildRecordFieldProjectionMetadata(
  definition: RecordDefinition,
  field: RecordFieldDefinition
): RecordFieldProjectionMetadata {
  return {
    kind: 'field',
    recordName: definition.name,
    fieldName: field.name,
    classification: field.classification,
    display: definition.display
  };
}

function setNamespaceMetadata(
  value: StructuredValue,
  metadata: Record<string, NamespaceFieldMetadata>
): void {
  if (!value.internal) {
    value.internal = {};
  }
  (value.internal as Record<string, unknown>).namespaceMetadata = metadata;
}

function createRecordRootVariable(
  name: 'input' | 'key' | 'value',
  value: unknown
): Variable {
  return createStructuredValueVariable(
    name,
    isStructuredValue(value) ? value : wrapStructured(value as any),
    RECORD_INPUT_SOURCE,
    {
      internal: {
        isReserved: true,
        isSystem: true
      }
    }
  );
}

function extractRecordInputValue(value: unknown): unknown {
  if (isVariable(value)) {
    return value.value;
  }
  if (isStructuredValue(value)) {
    return value.data;
  }
  return value;
}

function cloneStructuredValue<T>(value: StructuredValue<T>): StructuredValue<T> {
  const clone = wrapStructured(
    value.data,
    value.type,
    value.text,
    value.metadata ? { ...value.metadata } : undefined
  );
  if (value.internal) {
    clone.internal = { ...value.internal };
  }
  return clone;
}

function cloneValueIfStructured(value: unknown): unknown {
  return isStructuredValue(value) ? cloneStructuredValue(value) : value;
}

function hasRecordRootBinding(
  context: RecordRootContext,
  binding: 'input' | 'key' | 'value'
): boolean {
  return Object.prototype.hasOwnProperty.call(context, binding);
}

function extractStringCandidate(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (isStructuredValue(value) && typeof value.text === 'string') {
    return value.text;
  }
  if (isVariable(value) && typeof value.value === 'string') {
    return value.value;
  }
  return undefined;
}

function extractFenceCandidate(value: string): string | undefined {
  const match = value.match(/```(?:json|yaml|yml)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim();
}

function extractBracketCandidate(value: string, open: '{' | '['): string | undefined {
  const close = open === '{' ? '}' : ']';
  const start = value.indexOf(open);
  const end = value.lastIndexOf(close);
  if (start < 0 || end <= start) {
    return undefined;
  }
  return value.slice(start, end + 1).trim();
}

function parseStructuredCandidate(candidate: string): unknown {
  try {
    return JSON.parse(candidate);
  } catch {}

  return yaml.load(candidate);
}

function tryParseStructuredRecordInput(value: unknown): unknown {
  const text = extractStringCandidate(value);
  if (typeof text !== 'string') {
    return undefined;
  }

  const trimmed = text.trim();
  const candidates = [
    extractFenceCandidate(trimmed),
    trimmed,
    extractBracketCandidate(trimmed, '{'),
    extractBracketCandidate(trimmed, '[')
  ].filter((candidate, index, items): candidate is string => {
    return typeof candidate === 'string' && candidate.length > 0 && items.indexOf(candidate) === index;
  });

  for (const candidate of candidates) {
    try {
      return parseStructuredCandidate(candidate);
    } catch {}
  }

  return undefined;
}

function parseRecordInput(
  value: unknown,
  rootMode: RecordDefinition['rootMode']
): { parsed?: unknown; error?: RecordValidationError } {
  const extracted = extractRecordInputValue(value);
  if (Array.isArray(extracted) || (extracted && typeof extracted === 'object')) {
    return { parsed: extracted };
  }

  const parsedStructured = tryParseStructuredRecordInput(value);
  if (parsedStructured !== undefined) {
    return { parsed: parsedStructured };
  }

  if (rootMode === 'scalar') {
    return { parsed: extracted };
  }

  return {
    error: {
      path: '$',
      code: 'parse',
      message:
        typeof extractStringCandidate(value) === 'string'
          ? 'Failed to parse structured record output'
          : 'Record output must be an object, array, or structured string payload'
    }
  };
}

function describeRecordValueType(value: unknown): string {
  const extracted = extractRecordInputValue(value);
  if (extracted === null) {
    return 'null';
  }
  if (Array.isArray(extracted)) {
    return 'array';
  }
  return typeof extracted;
}

function isHandleToken(value: unknown): value is string {
  return typeof value === 'string' && /^h_[a-z0-9]+$/.test(value.trim());
}

function resolveHandleTypedFieldValue(
  value: unknown,
  env: Environment
): { ok: true; value: unknown } | { ok: false; actual: string } {
  const extracted = extractRecordInputValue(value);
  let handle: string | undefined;

  if (isHandleToken(extracted)) {
    handle = extracted.trim();
  } else if (isHandleWrapper(extracted)) {
    handle = extracted.handle.trim();
  } else {
    handle = extractProjectedHandleToken(extracted);
    if (!handle) {
      handle = asText(value).trim();
      if (!isHandleToken(handle)) {
        handle = undefined;
      }
    }
  }

  if (!handle) {
    return { ok: false, actual: describeRecordValueType(value) };
  }

  try {
    return { ok: true, value: env.resolveHandle(handle) };
  } catch {
    return { ok: false, actual: 'unknown-handle' };
  }
}

function coerceFieldValue(
  field: RecordFieldDefinition,
  value: unknown,
  env: Environment
): { ok: true; value: unknown } | { ok: false; actual: string } {
  const extracted = extractRecordInputValue(value);
  if (!field.valueType) {
    if (typeof extracted === 'string' || typeof extracted === 'number' || typeof extracted === 'boolean') {
      return { ok: true, value: extracted };
    }
    return { ok: false, actual: describeRecordValueType(value) };
  }

  if (field.valueType === 'string') {
    if (extracted === null || extracted === undefined) {
      return { ok: false, actual: String(extracted) };
    }
    return {
      ok: true,
      value: typeof extracted === 'string' ? extracted.trim() : String(extracted)
    };
  }

  if (field.valueType === 'number') {
    if (typeof extracted === 'number' && Number.isFinite(extracted)) {
      return { ok: true, value: extracted };
    }
    if (typeof extracted === 'string' && extracted.trim().length > 0) {
      const parsed = Number(extracted.trim());
      if (Number.isFinite(parsed)) {
        return { ok: true, value: parsed };
      }
    }
    return { ok: false, actual: describeRecordValueType(value) };
  }

  if (field.valueType === 'boolean') {
    if (typeof extracted === 'boolean') {
      return { ok: true, value: extracted };
    }
    if (typeof extracted === 'string') {
      const normalized = extracted.trim().toLowerCase();
      if (normalized === 'true') {
        return { ok: true, value: true };
      }
      if (normalized === 'false') {
        return { ok: true, value: false };
      }
    }
    return { ok: false, actual: describeRecordValueType(value) };
  }

  if (field.valueType === 'array') {
    if (Array.isArray(extracted)) {
      return { ok: true, value };
    }
    return { ok: false, actual: describeRecordValueType(value) };
  }

  if (field.valueType === 'object') {
    if (isPlainObject(extracted)) {
      return { ok: true, value };
    }
    return { ok: false, actual: describeRecordValueType(value) };
  }

  if (field.valueType === 'handle') {
    return resolveHandleTypedFieldValue(value, env);
  }

  return { ok: false, actual: describeRecordValueType(value) };
}

function mergeFieldDescriptorWithValue(
  value: unknown,
  fieldDescriptor: SecurityDescriptor | undefined
): SecurityDescriptor | undefined {
  const valueDescriptor = extractSecurityDescriptor(value, {
    recursive: true,
    mergeArrayElements: true
  });
  if (fieldDescriptor && valueDescriptor) {
    return mergeDescriptors(valueDescriptor, fieldDescriptor);
  }
  return fieldDescriptor ?? valueDescriptor;
}

function applyFieldMetadata(
  value: StructuredValue,
  descriptor: SecurityDescriptor | undefined,
  factsources: readonly FactSourceHandle[],
  projection: RecordFieldProjectionMetadata
): StructuredValue {
  if (descriptor) {
    applySecurityDescriptorToStructuredValue(value, descriptor);
  }
  value.metadata = {
    ...(value.metadata ?? {}),
    factsources: [...factsources],
    projection
  };
  value.mx.factsources = [...factsources];
  return value;
}

function finalizeArrayFieldValue(options: {
  value: unknown;
  descriptor?: SecurityDescriptor;
  factsources: readonly FactSourceHandle[];
  projection: RecordFieldProjectionMetadata;
  materializeElementMetadata: boolean;
}): StructuredValue<unknown[]> {
  const extracted = extractRecordInputValue(options.value);
  const sourceItems = Array.isArray(extracted) ? extracted : [];
  const items = options.materializeElementMetadata
    ? sourceItems.map(item => {
        const child = isStructuredValue(item)
          ? cloneStructuredValue(item)
          : wrapStructured(item as any);
        return applyFieldMetadata(
          child,
          mergeFieldDescriptorWithValue(item, options.descriptor),
          options.factsources,
          options.projection
        );
      })
    : sourceItems.map(cloneValueIfStructured);

  const wrapped = wrapStructured(items, 'array', undefined, {
    factsources: [...options.factsources],
    projection: options.projection
  });
  return applyFieldMetadata(
    wrapped,
    mergeFieldDescriptorWithValue(options.value, options.descriptor),
    options.factsources,
    options.projection
  ) as StructuredValue<unknown[]>;
}

function finalizeObjectFieldValue(options: {
  value: unknown;
  descriptor?: SecurityDescriptor;
  factsources: readonly FactSourceHandle[];
  projection: RecordFieldProjectionMetadata;
}): StructuredValue<Record<string, unknown>> {
  const extracted = extractRecordInputValue(options.value);
  const sourceObject = isPlainObject(extracted) ? extracted : {};
  const clonedEntries = Object.fromEntries(
    Object.entries(sourceObject).map(([key, entry]) => [key, cloneValueIfStructured(entry)])
  );

  const wrapped = wrapStructured(clonedEntries, 'object', undefined, {
    factsources: [...options.factsources],
    projection: options.projection
  });
  return applyFieldMetadata(
    wrapped,
    mergeFieldDescriptorWithValue(options.value, options.descriptor),
    options.factsources,
    options.projection
  ) as StructuredValue<Record<string, unknown>>;
}

async function evaluateFieldValue(
  field: RecordFieldDefinition,
  context: RecordRootContext,
  env: Environment
): Promise<unknown> {
  const child = env.createChild();
  child.setVariable('input', createRecordRootVariable('input', context.input));
  if (hasRecordRootBinding(context, 'key')) {
    child.setVariable('key', createRecordRootVariable('key', context.key));
  }
  if (hasRecordRootBinding(context, 'value')) {
    child.setVariable('value', createRecordRootVariable('value', context.value));
  }

  try {
    if (field.kind === 'input') {
      return await evaluateDataValue(field.source as any, child, { suppressErrors: false });
    }
    return await evaluateDataValue(field.expression as any, child, { suppressErrors: false });
  } finally {
    await child.runScopeCleanups();
  }
}

function resolveRecordWhenConditionValue(
  bindings: RecordWhenBindings,
  condition: Exclude<RecordWhenCondition, { type: 'wildcard' }>
): unknown {
  if (condition.sourceRoot) {
    const base =
      condition.sourceRoot === 'key'
        ? bindings.key
        : condition.sourceRoot === 'value'
          ? bindings.value
          : bindings.input;
    if (!condition.path || condition.path.length === 0) {
      return base;
    }

    let current = base;
    for (const segment of condition.path) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  if (!isPlainObject(bindings.input)) {
    return undefined;
  }
  return bindings.input[condition.field];
}

function evaluateWhenCondition(bindings: RecordWhenBindings, condition: RecordWhenCondition): boolean {
  if (condition.type === 'wildcard') {
    return true;
  }

  const value = resolveRecordWhenConditionValue(bindings, condition);
  if (condition.type === 'truthy') {
    return Boolean(value);
  }

  if (condition.operator === '==') {
    return value === condition.value;
  }
  return value !== condition.value;
}

function resolveRecordWhen(
  bindings: RecordWhenBindings,
  when: readonly RecordWhenRule[] | undefined
): ResolvedRecordWhen {
  if (!when || when.length === 0) {
    return { tiers: [], demote: false, dataTrustOverrides: {} };
  }

  for (const rule of when) {
    if (!evaluateWhenCondition(bindings, rule.condition)) {
      continue;
    }
    if (rule.result.type === 'data') {
      return { tiers: [], demote: true, dataTrustOverrides: {} };
    }
    return {
      tiers: [...rule.result.tiers],
      demote: false,
      dataTrustOverrides: buildRecordWhenDataTrustOverrides(rule.result.overrides?.data)
    };
  }

  return { tiers: [], demote: false, dataTrustOverrides: {} };
}

function buildFactLabels(
  definition: RecordDefinition,
  fieldName: string,
  tiers: readonly string[]
): string[] {
  const address = `@${definition.name}.${fieldName}`;
  if (tiers.length === 0) {
    return [`fact:${address}`];
  }
  return [`fact:${tiers.join(':')}:${address}`];
}

function buildRecordWhenInput(
  context: RecordRootContext
): RecordWhenBindings {
  return {
    input: extractRecordInputValue(context.input),
    ...(hasRecordRootBinding(context, 'key')
      ? { key: extractRecordInputValue(context.key) }
      : {}),
    ...(hasRecordRootBinding(context, 'value')
      ? { value: extractRecordInputValue(context.value) }
      : {})
  };
}

function buildRecordWhenDataTrustOverrides(
  overrides: Record<string, string[]> | undefined
): Record<string, RecordDataTrustLevel> {
  if (!overrides) {
    return {};
  }

  const resolved: Record<string, RecordDataTrustLevel> = {};
  for (const [trust, fields] of Object.entries(overrides)) {
    if ((trust !== 'trusted' && trust !== 'untrusted') || !Array.isArray(fields)) {
      continue;
    }
    for (const fieldName of fields) {
      if (typeof fieldName === 'string' && fieldName.length > 0) {
        resolved[fieldName] = trust;
      }
    }
  }
  return resolved;
}

function resolveFieldDataTrust(
  field: RecordFieldDefinition,
  whenResult: ResolvedRecordWhen
): RecordDataTrustLevel | undefined {
  if (field.classification !== 'data') {
    return undefined;
  }
  return whenResult.dataTrustOverrides[field.name] ?? field.dataTrust ?? 'untrusted';
}

function shouldKeepRecordFieldUntrusted(options: {
  field: RecordFieldDefinition;
  allData: boolean;
  dataTrust?: RecordDataTrustLevel;
}): boolean {
  if (options.allData) {
    return true;
  }
  if (options.field.classification === 'fact') {
    return false;
  }
  return options.dataTrust !== 'trusted';
}

async function coerceRecordEntry(
  context: RecordRootContext,
  definition: RecordDefinition,
  env: Environment,
  identity: RecordCoercionIdentity,
  pathPrefix = '',
  inheritedDescriptor?: SecurityDescriptor
): Promise<RecordObjectResult> {
  const rootInput = extractRecordInputValue(context.input);
  if (definition.rootMode === 'object' && !isPlainObject(rootInput)) {
    return {
      value: wrapStructured({}, 'object'),
      errors: [
        {
          path: pathPrefix || '$',
          code: 'type',
          message: 'Record input must be an object',
          expected: 'object',
          actual: Array.isArray(rootInput) ? 'array' : typeof rootInput
        }
      ],
      factsources: []
    };
  }

  const shaped: Record<string, unknown> = {};
  const rawFieldValues: Record<string, unknown> = {};
  const invalidFieldNames = new Set<string>();
  const namespaceMetadata: Record<string, NamespaceFieldMetadata> = {};
  const errors: RecordValidationError[] = [];

  for (const field of definition.fields) {
    const rawValue = await evaluateFieldValue(field, context, env);
    const fieldPath = pathPrefix ? `${pathPrefix}.${field.name}` : field.name;

    if (rawValue === undefined || rawValue === null) {
      if (!field.optional) {
        errors.push({
          path: fieldPath,
          code: 'required',
          message: `Missing required field '${field.name}'`,
          expected: field.valueType ?? 'value'
        });
      }
      continue;
    }

    const coerced = coerceFieldValue(field, rawValue, env);
    if (!coerced.ok) {
      rawFieldValues[field.name] = rawValue;
      errors.push({
        path: fieldPath,
        code: 'type',
        message: `Field '${field.name}' expected ${field.valueType ?? 'scalar'}`,
        expected: field.valueType ?? 'scalar',
        actual: coerced.actual
      });
      if (definition.validate === 'drop') {
        continue;
      }
      invalidFieldNames.add(field.name);
      shaped[field.name] = rawValue;
      continue;
    }

    rawFieldValues[field.name] = field.valueType === 'handle' ? coerced.value : rawValue;
    shaped[field.name] = coerced.value;
  }

  const validationDemoted = definition.validate === 'demote' && errors.length > 0;
  const whenResult = resolveRecordWhen(buildRecordWhenInput(context), definition.when);
  const allData = validationDemoted || whenResult.demote;
  const factsources: FactSourceHandle[] = [];
  const wrapperSecurity = sanitizeRecordWrapperDescriptor(inheritedDescriptor);
  const instanceKey = getRecordInstanceKey(definition, shaped);

  for (const field of definition.fields) {
    if (!Object.prototype.hasOwnProperty.call(shaped, field.name)) {
      continue;
    }

    const fieldFactsources = [
      createFactSourceHandle({
        sourceRef: definition.name,
        field: field.name,
        ...(instanceKey ? { instanceKey } : {}),
        coercionId: identity.coercionId,
        position: identity.position,
        tiers: whenResult.tiers
      })
    ];
    factsources.push(...fieldFactsources);

    const labels =
      !allData && field.classification === 'fact'
        ? buildFactLabels(definition, field.name, whenResult.tiers)
        : [];
    const dataTrust = resolveFieldDataTrust(field, whenResult);
    const fieldProjection = buildRecordFieldProjectionMetadata(definition, field);
    const fieldSecurity = buildRecordFieldDescriptor({
      inheritedDescriptor,
      factLabels: labels,
      shouldKeepUntrusted: shouldKeepRecordFieldUntrusted({
        field,
        allData,
        dataTrust
      })
    });
    const namespaceSecurity = mergeFieldDescriptorWithValue(
      rawFieldValues[field.name],
      fieldSecurity
    );
    const effectiveArraySecurity =
      wrapperSecurity && fieldSecurity
        ? mergeDescriptors(wrapperSecurity, fieldSecurity)
        : fieldSecurity ?? wrapperSecurity;
    if (!invalidFieldNames.has(field.name)) {
      if (field.valueType === 'array') {
        shaped[field.name] = finalizeArrayFieldValue({
          value: shaped[field.name],
          descriptor: effectiveArraySecurity,
          factsources: fieldFactsources,
          projection: fieldProjection,
          materializeElementMetadata: !allData && field.classification === 'fact'
        });
      } else if (field.valueType === 'object') {
        shaped[field.name] = finalizeObjectFieldValue({
          value: shaped[field.name],
          descriptor: effectiveArraySecurity,
          factsources: fieldFactsources,
          projection: fieldProjection
        });
      }
    }
    namespaceMetadata[field.name] = {
      ...(namespaceSecurity
        ? {
            security: serializeSecurityDescriptor(
              namespaceSecurity
            )
          }
        : {}),
      factsources: fieldFactsources,
      projection: fieldProjection
    };
  }

  const structured = wrapStructured(shaped, 'object', undefined, {
    schema: buildSchemaMetadata(definition, errors),
    factsources,
    projection: buildRecordObjectProjectionMetadata(definition),
    ...(wrapperSecurity ? { security: wrapperSecurity } : {})
  });
  setNamespaceMetadata(structured, namespaceMetadata);
  return {
    value: structured,
    errors,
    factsources
  };
}

function buildRecordArrayOutput(options: {
  definition: RecordDefinition;
  items: StructuredValue<Record<string, unknown>>[];
  errors: RecordValidationError[];
  factsources: FactSourceHandle[];
  inheritedDescriptor?: SecurityDescriptor;
}): StructuredValue {
  const schema = buildSchemaMetadata(options.definition, options.errors);
  const wrapperSecurity = sanitizeRecordWrapperDescriptor(options.inheritedDescriptor);
  const wrapped = wrapStructured(options.items, 'array', undefined, {
    schema,
    factsources: dedupeFactSources(options.factsources),
    ...(wrapperSecurity ? { security: wrapperSecurity } : {})
  });
  setStructuredMetadata(wrapped, schema, options.factsources);
  return wrapped;
}

function formatMapEntryPath(pathPrefix: string, key: string): string {
  const serializedKey = JSON.stringify(key);
  return pathPrefix ? `${pathPrefix}[${serializedKey}]` : `[${serializedKey}]`;
}

function collectMapEntryContexts(parsed: unknown): {
  entries: Array<{ context: RecordRootContext; pathPrefix: string }>;
  errors: RecordValidationError[];
} {
  const entries: Array<{ context: RecordRootContext; pathPrefix: string }> = [];
  const errors: RecordValidationError[] = [];

  const pushMapEntries = (value: Record<string, unknown>, pathPrefix: string): void => {
    for (const [key, entryValue] of Object.entries(value)) {
      entries.push({
        context: {
          input: entryValue,
          key,
          value: entryValue
        },
        pathPrefix: formatMapEntryPath(pathPrefix, key)
      });
    }
  };

  if (isPlainObject(parsed)) {
    pushMapEntries(parsed, '');
    return { entries, errors };
  }

  if (Array.isArray(parsed)) {
    parsed.forEach((item, index) => {
      if (isPlainObject(item)) {
        pushMapEntries(item, `[${index}]`);
        return;
      }
      errors.push({
        path: `[${index}]`,
        code: 'type',
        message: 'Record input must be an object map',
        expected: 'object',
        actual: Array.isArray(item) ? 'array' : typeof item
      });
    });
    return { entries, errors };
  }

  errors.push({
    path: '$',
    code: 'type',
    message: 'Record input must be an object map',
    expected: 'object',
    actual: Array.isArray(parsed) ? 'array' : typeof parsed
  });
  return { entries, errors };
}

function throwStrictValidationError(
  definition: RecordDefinition,
  errors: readonly RecordValidationError[]
): never {
  const summary = errors[0]?.message ?? `Record '@${definition.name}' validation failed`;
  throw createRecordError(definition, summary, 'RECORD_VALIDATION_FAILED');
}

export async function coerceRecordOutput(options: {
  definition: RecordDefinition;
  value: unknown;
  env: Environment;
  inheritedDescriptor?: SecurityDescriptor;
}): Promise<StructuredValue> {
  const parsedInput = parseRecordInput(options.value, options.definition.rootMode);
  if (parsedInput.error) {
    if (options.definition.validate === 'strict') {
      throwStrictValidationError(options.definition, [parsedInput.error]);
    }

    const schema = buildSchemaMetadata(options.definition, [parsedInput.error]);
    const fallback = wrapStructured(extractStringCandidate(options.value) ?? asText(options.value), 'text', undefined, {
      schema,
      factsources: []
    });
    setStructuredMetadata(fallback, schema, []);
    return fallback;
  }

  const parsed = parsedInput.parsed;

  if (options.definition.rootMode === 'map-entry') {
    const mapEntries = collectMapEntryContexts(parsed);
    const items: StructuredValue<Record<string, unknown>>[] = [];
    const errors: RecordValidationError[] = [...mapEntries.errors];
    const factsources: FactSourceHandle[] = [];
    const coercionId = randomUUID();

    for (let index = 0; index < mapEntries.entries.length; index += 1) {
      const entry = mapEntries.entries[index]!;
      const item = await coerceRecordEntry(
        entry.context,
        options.definition,
        options.env,
        { coercionId, position: index },
        entry.pathPrefix,
        options.inheritedDescriptor
      );
      items.push(item.value);
      errors.push(...item.errors);
      factsources.push(...item.factsources);
    }

    if (options.definition.validate === 'strict' && errors.length > 0) {
      throwStrictValidationError(options.definition, errors);
    }

    return buildRecordArrayOutput({
      definition: options.definition,
      items,
      errors,
      factsources,
      inheritedDescriptor: options.inheritedDescriptor
    });
  }

  if (Array.isArray(parsed)) {
    const items: StructuredValue<Record<string, unknown>>[] = [];
    const errors: RecordValidationError[] = [];
    const factsources: FactSourceHandle[] = [];
    const coercionId = randomUUID();

    for (let index = 0; index < parsed.length; index += 1) {
      const item = await coerceRecordEntry(
        { input: parsed[index] },
        options.definition,
        options.env,
        { coercionId, position: index },
        `[${index}]`,
        options.inheritedDescriptor
      );
      items.push(item.value);
      errors.push(...item.errors);
      factsources.push(...item.factsources);
    }

    if (options.definition.validate === 'strict' && errors.length > 0) {
      throwStrictValidationError(options.definition, errors);
    }

    return buildRecordArrayOutput({
      definition: options.definition,
      items,
      errors,
      factsources,
      inheritedDescriptor: options.inheritedDescriptor
    });
  }

  const objectResult = await coerceRecordEntry(
    { input: parsed },
    options.definition,
    options.env,
    { coercionId: randomUUID(), position: 0 },
    '',
    options.inheritedDescriptor
  );
  if (options.definition.validate === 'strict' && objectResult.errors.length > 0) {
    throwStrictValidationError(options.definition, objectResult.errors);
  }

  setStructuredMetadata(
    objectResult.value,
    buildSchemaMetadata(options.definition, objectResult.errors),
    objectResult.factsources
  );
  return objectResult.value;
}
