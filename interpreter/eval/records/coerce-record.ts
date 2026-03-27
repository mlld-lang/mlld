import * as yaml from 'js-yaml';
import type { Environment } from '@interpreter/env/Environment';
import {
  createStructuredValueVariable,
  type Variable,
  type VariableSource
} from '@core/types/variable';
import { MlldInterpreterError } from '@core/errors';
import type {
  RecordDefinition,
  RecordDisplayMode,
  RecordFieldDefinition,
  RecordFieldProjectionMetadata,
  RecordObjectProjectionMetadata,
  RecordSchemaMetadata,
  RecordValidationError,
  RecordWhenCondition,
  RecordWhenRule
} from '@core/types/record';
import { createFactSourceHandle, type FactSourceHandle } from '@core/types/handle';
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
import { evaluateDataValue } from '@interpreter/eval/data-value-evaluator';
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

const RECORD_INPUT_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'reference',
  hasInterpolation: false,
  isMultiLine: false
};

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

function resolveFieldDisplayMode(
  definition: RecordDefinition,
  field: RecordFieldDefinition
): RecordDisplayMode {
  if (field.classification === 'data') {
    return 'bare';
  }
  if (!Array.isArray(definition.display)) {
    return 'bare';
  }
  const explicit = definition.display.find(entry => entry.field === field.name);
  if (!explicit) {
    return 'handle';
  }
  return explicit.kind === 'mask' ? 'mask' : 'bare';
}

function buildRecordObjectProjectionMetadata(
  definition: RecordDefinition
): RecordObjectProjectionMetadata {
  return {
    kind: 'record',
    recordName: definition.name,
    hasDisplay: Array.isArray(definition.display),
    fields: Object.fromEntries(
      definition.fields.map(field => [
        field.name,
        {
          classification: field.classification,
          display: resolveFieldDisplayMode(definition, field)
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
    display: resolveFieldDisplayMode(definition, field),
    hasDisplay: Array.isArray(definition.display)
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

function createInputVariable(value: unknown): Variable {
  return createStructuredValueVariable(
    'input',
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

function parseRecordInput(value: unknown): { parsed?: unknown; error?: RecordValidationError } {
  const extracted = extractRecordInputValue(value);
  if (Array.isArray(extracted) || (extracted && typeof extracted === 'object')) {
    return { parsed: extracted };
  }

  const text = extractStringCandidate(value);
  if (typeof text !== 'string') {
    return {
      error: {
        path: '$',
        code: 'parse',
        message: 'Record output must be an object, array, or structured string payload'
      }
    };
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
      return { parsed: parseStructuredCandidate(candidate) };
    } catch {}
  }

  return {
    error: {
      path: '$',
      code: 'parse',
      message: 'Failed to parse structured record output'
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

function coerceFieldValue(
  field: RecordFieldDefinition,
  value: unknown
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

async function evaluateFieldValue(
  definition: RecordDefinition,
  field: RecordFieldDefinition,
  input: unknown,
  env: Environment
): Promise<unknown> {
  const child = env.createChild();
  child.setVariable('input', createInputVariable(input));

  try {
    if (field.kind === 'input') {
      return await evaluateDataValue(field.source as any, child, { suppressErrors: false });
    }
    return await evaluateDataValue(field.expression as any, child, { suppressErrors: false });
  } finally {
    await child.runScopeCleanups();
  }
}

function evaluateWhenCondition(input: Record<string, unknown>, condition: RecordWhenCondition): boolean {
  if (condition.type === 'wildcard') {
    return true;
  }

  const value = input[condition.field];
  if (condition.type === 'truthy') {
    return Boolean(value);
  }

  if (condition.operator === '==') {
    return value === condition.value;
  }
  return value !== condition.value;
}

function resolveRecordWhen(
  input: Record<string, unknown>,
  when: readonly RecordWhenRule[] | undefined
): { tiers: string[]; demote: boolean } {
  if (!when || when.length === 0) {
    return { tiers: [], demote: false };
  }

  for (const rule of when) {
    if (!evaluateWhenCondition(input, rule.condition)) {
      continue;
    }
    if (rule.result.type === 'data') {
      return { tiers: [], demote: true };
    }
    return { tiers: [...rule.result.tiers], demote: false };
  }

  return { tiers: [], demote: false };
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

async function coerceRecordObject(
  rawInput: unknown,
  definition: RecordDefinition,
  env: Environment,
  pathPrefix = '',
  inheritedDescriptor?: SecurityDescriptor
): Promise<RecordObjectResult> {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return {
      value: wrapStructured({}, 'object'),
      errors: [
        {
          path: pathPrefix || '$',
          code: 'type',
          message: 'Record input must be an object',
          expected: 'object',
          actual: Array.isArray(rawInput) ? 'array' : typeof rawInput
        }
      ],
      factsources: []
    };
  }

  const shaped: Record<string, unknown> = {};
  const namespaceMetadata: Record<string, NamespaceFieldMetadata> = {};
  const errors: RecordValidationError[] = [];

  for (const field of definition.fields) {
    const rawValue = await evaluateFieldValue(definition, field, rawInput, env);
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

    const coerced = coerceFieldValue(field, rawValue);
    if (!coerced.ok) {
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
      shaped[field.name] = rawValue;
      continue;
    }

    shaped[field.name] = coerced.value;
  }

  const validationDemoted = definition.validate === 'demote' && errors.length > 0;
  const whenResult = resolveRecordWhen(rawInput as Record<string, unknown>, definition.when);
  const allData = validationDemoted || whenResult.demote;
  const factsources: FactSourceHandle[] = [];
  const wrapperSecurity = sanitizeRecordWrapperDescriptor(inheritedDescriptor);

  for (const field of definition.fields) {
    if (!Object.prototype.hasOwnProperty.call(shaped, field.name)) {
      continue;
    }

    const fieldFactsources = [
      createFactSourceHandle({
        sourceRef: definition.name,
        field: field.name,
        tiers: whenResult.tiers
      })
    ];
    factsources.push(...fieldFactsources);

    const labels =
      !allData && field.classification === 'fact'
        ? buildFactLabels(definition, field.name, whenResult.tiers)
        : [];
    const fieldProjection = buildRecordFieldProjectionMetadata(definition, field);
    const fieldSecurity = buildRecordFieldDescriptor({
      inheritedDescriptor,
      factLabels: labels,
      shouldKeepUntrusted: allData || field.classification === 'data'
    });
    const effectiveArraySecurity =
      wrapperSecurity && fieldSecurity
        ? mergeDescriptors(wrapperSecurity, fieldSecurity)
        : fieldSecurity ?? wrapperSecurity;
    if (field.valueType === 'array') {
      shaped[field.name] = finalizeArrayFieldValue({
        value: shaped[field.name],
        descriptor: effectiveArraySecurity,
        factsources: fieldFactsources,
        projection: fieldProjection,
        materializeElementMetadata: !allData && field.classification === 'fact'
      });
    }
    namespaceMetadata[field.name] = {
      ...(fieldSecurity
        ? {
            security: serializeSecurityDescriptor(
              fieldSecurity
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
  const parsedInput = parseRecordInput(options.value);
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
  if (Array.isArray(parsed)) {
    const items: StructuredValue<Record<string, unknown>>[] = [];
    const errors: RecordValidationError[] = [];
    const factsources: FactSourceHandle[] = [];

    for (let index = 0; index < parsed.length; index += 1) {
      const item = await coerceRecordObject(
        parsed[index],
        options.definition,
        options.env,
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

    const schema = buildSchemaMetadata(options.definition, errors);
    const wrapped = wrapStructured(items, 'array', undefined, {
      schema,
      factsources: dedupeFactSources(factsources),
      ...(sanitizeRecordWrapperDescriptor(options.inheritedDescriptor)
        ? { security: sanitizeRecordWrapperDescriptor(options.inheritedDescriptor) }
        : {})
    });
    setStructuredMetadata(wrapped, schema, factsources);
    return wrapped;
  }

  const objectResult = await coerceRecordObject(
    parsed,
    options.definition,
    options.env,
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
