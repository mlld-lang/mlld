import type { NodeFunctionExecutable } from '@core/types/executable';
import { MlldInterpreterError, MlldSecurityError } from '@core/errors';
import type { RecordDefinition, RecordFieldDefinition, RecordFieldProjectionMetadata, RecordObjectProjectionMetadata } from '@core/types/record';
import type {
  NormalizedShelfScope,
  SerializedShelfDefinition,
  ShelfDefinition,
  ShelfMergeMode,
  ShelfScopeSlotBinding,
  ShelfSlotRefValue,
  ShelfScopeSlotRef,
  ShelfSlotCardinality
} from '@core/types/shelf';
import {
  createShelfSlotRefValue,
  isNormalizedShelfScope,
  isShelfSlotRefValue
} from '@core/types/shelf';
import { createExecutableVariable, createObjectVariable, createStructuredValueVariable, type Variable, type VariableSource } from '@core/types/variable';
import { makeSecurityDescriptor, mergeDescriptors, removeLabelsFromDescriptor, serializeSecurityDescriptor, type SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import { evaluateDataValue } from '@interpreter/eval/data-value-evaluator';
import { renderDisplayProjectionSync } from '@interpreter/eval/records/display-projection';
import { encodeCanonicalValue } from '@interpreter/security/canonical-value';
import { resolveValueHandles } from '@interpreter/utils/handle-resolution';
import {
  applySecurityDescriptorToStructuredValue,
  asData,
  extractSecurityDescriptor,
  isStructuredValue,
  setRecordProjectionMetadata,
  wrapStructured,
  type StructuredValue
} from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';
import type { DataAliasedValue, DataValue } from '@core/types/var';
import { isHandleWrapper } from '@core/types/handle';
import type { RuntimeTraceScope } from '@core/types/trace';
import { traceRecordCoerce, traceRecordSchemaFail } from '@interpreter/tracing/events';

type ShelfNamespaceMetadata = {
  security?: ReturnType<typeof serializeSecurityDescriptor>;
  factsources?: readonly unknown[];
  projection?: RecordFieldProjectionMetadata;
};

const SHELF_VARIABLE_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'object',
  hasInterpolation: false,
  isMultiLine: false
};

const SHELF_SCOPE_MARKER = '__mlldShelfScope';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
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

function createStructuredSnapshot(value: unknown): StructuredValue {
  if (isStructuredValue(value)) {
    return cloneStructuredValue(value);
  }
  if (Array.isArray(value)) {
    return wrapStructured([...value], 'array');
  }
  return wrapStructured(value as any);
}

function preserveStructuredScalarValue<T extends string | number | boolean>(
  original: unknown,
  nextValue: T
): unknown {
  if (!isStructuredValue(original)) {
    return nextValue;
  }

  const clone = cloneStructuredValue(original);
  clone.data = nextValue as any;
  clone.text = String(nextValue);
  clone.mx.text = clone.text;
  clone.mx.data = nextValue;
  return clone;
}

function stripKnownDescriptor(descriptor: SecurityDescriptor | undefined): SecurityDescriptor | undefined {
  return removeLabelsFromDescriptor(descriptor, ['known']);
}

function buildSlotSourceLabel(shelfName: string, slotName: string): string {
  return `src:shelf:@${shelfName}.${slotName}`;
}

function buildSlotSourceDescriptor(shelfName: string, slotName: string): SecurityDescriptor {
  return makeSecurityDescriptor({
    taint: [buildSlotSourceLabel(shelfName, slotName)]
  });
}

function buildRecordObjectProjectionMetadata(definition: RecordDefinition): RecordObjectProjectionMetadata {
  return {
    kind: 'record',
    recordName: definition.name,
    display: definition.display,
    fields: Object.fromEntries(
      definition.fields.map(field => [
        field.name,
        {
          classification: field.classification,
          ...(field.dataTrust ? { dataTrust: field.dataTrust } : {})
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
    ...(field.dataTrust ? { dataTrust: field.dataTrust } : {}),
    display: definition.display
  };
}

function setNamespaceMetadata(
  value: StructuredValue,
  metadata: Record<string, ShelfNamespaceMetadata>
): void {
  if (!value.internal) {
    value.internal = {};
  }
  (value.internal as Record<string, unknown>).namespaceMetadata = metadata;
}

function createRecordRootVariable(name: 'input' | 'key' | 'value', value: unknown): Variable {
  return createStructuredValueVariable(
    name,
    isStructuredValue(value) ? value : wrapStructured(value as any),
    {
      directive: 'var',
      syntax: 'reference',
      hasInterpolation: false,
      isMultiLine: false
    },
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
    return isShelfSlotRefValue(value.value) ? value.value.current : value.value;
  }
  if (isShelfSlotRefValue(value)) {
    return value.current;
  }
  if (isStructuredValue(value)) {
    return value.data;
  }
  return value;
}

async function evaluateFieldValue(
  field: RecordFieldDefinition,
  context: { input: unknown; key?: unknown; value?: unknown },
  env: Environment
): Promise<unknown> {
  const child = env.createChild();
  child.setVariable('input', createRecordRootVariable('input', context.input));
  if (Object.prototype.hasOwnProperty.call(context, 'key')) {
    child.setVariable('key', createRecordRootVariable('key', context.key));
  }
  if (Object.prototype.hasOwnProperty.call(context, 'value')) {
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
    if (
      typeof extracted === 'string'
      || typeof extracted === 'number'
      || typeof extracted === 'boolean'
    ) {
      return { ok: true, value: extracted };
    }
    return { ok: false, actual: describeRecordValueType(value) };
  }

  if (field.valueType === 'string') {
    if (extracted === null || extracted === undefined) {
      return { ok: false, actual: String(extracted) };
    }
    const normalized = typeof extracted === 'string' ? extracted.trim() : String(extracted);
    return {
      ok: true,
      value: preserveStructuredScalarValue(value, normalized)
    };
  }

  if (field.valueType === 'number') {
    if (typeof extracted === 'number' && Number.isFinite(extracted)) {
      return { ok: true, value: preserveStructuredScalarValue(value, extracted) };
    }
    if (typeof extracted === 'string' && extracted.trim().length > 0) {
      const parsed = Number(extracted.trim());
      if (Number.isFinite(parsed)) {
        return { ok: true, value: preserveStructuredScalarValue(value, parsed) };
      }
    }
    return { ok: false, actual: describeRecordValueType(value) };
  }

  if (field.valueType === 'boolean') {
    if (typeof extracted === 'boolean') {
      return { ok: true, value: preserveStructuredScalarValue(value, extracted) };
    }
    if (typeof extracted === 'string') {
      const normalized = extracted.trim().toLowerCase();
      if (normalized === 'true') {
        return { ok: true, value: preserveStructuredScalarValue(value, true) };
      }
      if (normalized === 'false') {
        return { ok: true, value: preserveStructuredScalarValue(value, false) };
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

function fieldCarriesFactProof(value: unknown): boolean {
  const descriptor = stripKnownDescriptor(
    extractSecurityDescriptor(value, {
      recursive: true,
      mergeArrayElements: true
    })
  );
  return Boolean(descriptor?.labels.some(label => label.startsWith('fact:')));
}

function allArrayElementsCarryFactProof(value: unknown): boolean {
  const extracted = extractRecordInputValue(value);
  if (!Array.isArray(extracted)) {
    return false;
  }
  return extracted.every(item => fieldCarriesFactProof(item));
}

function isAcceptedAgentFactInput(value: unknown): boolean {
  if (isVariable(value)) {
    return isAcceptedAgentFactInput(value.value);
  }
  if (isStructuredValue(value)) {
    return fieldCarriesFactProof(value);
  }
  if (isHandleWrapper(value) || isHandleToken(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(item => isAcceptedAgentFactInput(item));
  }
  return false;
}

function buildRecordRootContext(
  input: unknown,
  definition: RecordDefinition
): { input: unknown; key?: unknown; value?: unknown } {
  if (definition.rootMode !== 'map-entry') {
    return { input };
  }

  const raw = extractRecordInputValue(input);
  if (Array.isArray(raw) && raw.length === 2) {
    return { input, key: raw[0], value: raw[1] };
  }
  if (isPlainObject(raw) && 'key' in raw && 'value' in raw) {
    return { input, key: raw.key, value: raw.value };
  }
  if (isPlainObject(raw)) {
    const entries = Object.entries(raw);
    if (entries.length === 1) {
      return { input, key: entries[0][0], value: entries[0][1] };
    }
  }

  throw new MlldInterpreterError(
    `Shelf slots do not support ${definition.rootMode} record inputs without explicit key/value payloads`,
    'shelf',
    undefined,
    { code: 'INVALID_SHELF_VALUE' }
  );
}

function normalizeStructuredFieldValue(
  value: unknown,
  descriptor: SecurityDescriptor | undefined,
  projection: RecordFieldProjectionMetadata
): StructuredValue {
  const structured = isStructuredValue(value)
    ? cloneStructuredValue(value)
    : wrapStructured(extractRecordInputValue(value) as any);
  if (descriptor) {
    applySecurityDescriptorToStructuredValue(structured, descriptor);
  }
  setRecordProjectionMetadata(structured, projection);
  const factsources = isStructuredValue(value) && Array.isArray(value.metadata?.factsources)
    ? [...value.metadata.factsources]
    : [];
  if (factsources.length > 0) {
    structured.metadata = {
      ...(structured.metadata ?? {}),
      factsources
    };
    structured.mx.factsources = factsources;
  }
  return structured;
}

function normalizeStructuredArrayFieldValue(
  value: unknown,
  descriptor: SecurityDescriptor | undefined,
  projection: RecordFieldProjectionMetadata
): StructuredValue<unknown[]> {
  const extracted = extractRecordInputValue(value);
  const items = Array.isArray(extracted)
    ? extracted.map(item => normalizeStructuredFieldValue(item, descriptor, projection))
    : [];
  const structured = wrapStructured(items, 'array', undefined, {
    projection
  });
  if (descriptor) {
    applySecurityDescriptorToStructuredValue(structured, descriptor);
  }
  setRecordProjectionMetadata(structured, projection);
  return structured as StructuredValue<unknown[]>;
}

async function validateShelfRecordValue(options: {
  value: unknown;
  definition: RecordDefinition;
  env: Environment;
  shelfName: string;
  slotName: string;
  strictFactInputs: boolean;
}): Promise<StructuredValue<Record<string, unknown>>> {
  const context = buildRecordRootContext(options.value, options.definition);
  const rootInput = extractRecordInputValue(context.input);
  if (options.definition.rootMode === 'object' && !isPlainObject(rootInput)) {
    options.env.emitRuntimeTraceEvent(traceRecordSchemaFail({
      record: options.definition.name,
      shelf: `@${options.shelfName}.${options.slotName}`,
      reason: 'invalid_root_type',
      expected: 'object',
      actual: describeRecordValueType(context.input)
    }));
    throw new MlldInterpreterError(
      `Slot '@${options.shelfName}.${options.slotName}' expects an object for record '@${options.definition.name}'`,
      'shelf',
      undefined,
      { code: 'INVALID_SHELF_VALUE' }
    );
  }

  const slotDescriptor = buildSlotSourceDescriptor(options.shelfName, options.slotName);
  const shaped: Record<string, unknown> = {};
  const namespaceMetadata: Record<string, ShelfNamespaceMetadata> = {};

  for (const field of options.definition.fields) {
    let rawFieldValue = await evaluateFieldValue(field, context, options.env);
    if (rawFieldValue === undefined || rawFieldValue === null) {
      if (!field.optional) {
        options.env.emitRuntimeTraceEvent(traceRecordSchemaFail({
          record: options.definition.name,
          field: field.name,
          shelf: `@${options.shelfName}.${options.slotName}`,
          reason: 'missing_required_field'
        }));
        throw new MlldInterpreterError(
          `Missing required field '${field.name}' for slot '@${options.shelfName}.${options.slotName}'`,
          'shelf',
          undefined,
          { code: 'INVALID_SHELF_VALUE' }
        );
      }
      continue;
    }

    if (options.strictFactInputs && field.classification === 'fact' && !isAcceptedAgentFactInput(rawFieldValue)) {
      throw new MlldSecurityError(
        `Fact field '${field.name}' in slot '@${options.shelfName}.${options.slotName}' requires handle-bearing input`,
        {
          code: 'SHELF_FACT_INPUT_REQUIRED',
          details: {
            field: field.name,
            slot: `@${options.shelfName}.${options.slotName}`
          }
        }
      );
    }

    if (field.classification === 'fact' || field.valueType === 'handle') {
      rawFieldValue = await resolveValueHandles(rawFieldValue, options.env);
    }

    const coerced = coerceFieldValue(field, rawFieldValue, options.env);
    if (!coerced.ok) {
      options.env.emitRuntimeTraceEvent(traceRecordSchemaFail({
        record: options.definition.name,
        field: field.name,
        shelf: `@${options.shelfName}.${options.slotName}`,
        reason: 'invalid_field_type',
        expected: field.valueType ?? 'scalar',
        actual: coerced.actual
      }));
      throw new MlldInterpreterError(
        `Field '${field.name}' in slot '@${options.shelfName}.${options.slotName}' expected ${field.valueType ?? 'scalar'} but received ${coerced.actual}`,
        'shelf',
        undefined,
        { code: 'INVALID_SHELF_VALUE' }
      );
    }
    options.env.emitRuntimeTraceEvent(traceRecordCoerce({
      record: options.definition.name,
      field: field.name,
      shelf: `@${options.shelfName}.${options.slotName}`,
      expected: field.valueType ?? 'scalar',
      value: options.env.summarizeTraceValue(coerced.value)
    }));

    const projection = buildRecordFieldProjectionMetadata(options.definition, field);
    const fieldDescriptor = stripKnownDescriptor(
      mergeDescriptors(
        extractSecurityDescriptor(rawFieldValue, {
          recursive: true,
          mergeArrayElements: true
        }),
        slotDescriptor
      )
    );
    const normalizedFieldValue =
      field.valueType === 'array'
        ? normalizeStructuredArrayFieldValue(coerced.value, fieldDescriptor, projection)
        : normalizeStructuredFieldValue(coerced.value, fieldDescriptor, projection);

    if (field.classification === 'fact') {
      const grounded = field.valueType === 'array'
        ? allArrayElementsCarryFactProof(normalizedFieldValue)
        : fieldCarriesFactProof(normalizedFieldValue);
      if (!grounded) {
        options.env.emitRuntimeTraceEvent(traceRecordSchemaFail({
          record: options.definition.name,
          field: field.name,
          shelf: `@${options.shelfName}.${options.slotName}`,
          reason: 'missing_fact_proof'
        }));
        throw new MlldSecurityError(
          `Fact field '${field.name}' in slot '@${options.shelfName}.${options.slotName}' is missing fact proof`,
          {
            code: 'SHELF_FACT_PROOF_REQUIRED',
            details: {
              field: field.name,
              slot: `@${options.shelfName}.${options.slotName}`
            }
          }
        );
      }
    }

    shaped[field.name] = normalizedFieldValue;
    namespaceMetadata[field.name] = {
      ...(fieldDescriptor ? { security: serializeSecurityDescriptor(fieldDescriptor) } : {}),
      ...(Array.isArray(normalizedFieldValue.metadata?.factsources)
        ? { factsources: [...normalizedFieldValue.metadata.factsources] }
        : {}),
      projection
    };
  }

  const root = wrapStructured(shaped, 'object', undefined, {
    projection: buildRecordObjectProjectionMetadata(options.definition)
  });
  const rootDescriptor = stripKnownDescriptor(
    mergeDescriptors(
      // Keep root-level security plus slot provenance without re-attaching every
      // child fact label to the record wrapper. Field metadata carries the
      // per-field fact proof; making the root recursive here smears sibling fact
      // labels back onto individual fields after a shelf round-trip.
      extractSecurityDescriptor(options.value),
      slotDescriptor
    )
  );
  if (rootDescriptor) {
    applySecurityDescriptorToStructuredValue(root, rootDescriptor);
  }
  setNamespaceMetadata(root, namespaceMetadata);
  return root;
}

function normalizeStoredCollection(state: unknown): StructuredValue<Record<string, unknown>>[] {
  if (!state) {
    return [];
  }
  if (Array.isArray(state)) {
    return state.filter(isStructuredValue) as StructuredValue<Record<string, unknown>>[];
  }
  if (isStructuredValue(state) && Array.isArray(state.data)) {
    return state.data.filter(isStructuredValue) as StructuredValue<Record<string, unknown>>[];
  }
  return isStructuredValue(state)
    ? [state as StructuredValue<Record<string, unknown>>]
    : [];
}

function readStructuredFieldValue(recordValue: StructuredValue<Record<string, unknown>>, fieldName: string): unknown {
  const data = asData<Record<string, unknown>>(recordValue);
  return data?.[fieldName];
}

function readIdentityKey(
  recordValue: StructuredValue<Record<string, unknown>>,
  keyField: string
): string | undefined {
  return encodeCanonicalValue(readStructuredFieldValue(recordValue, keyField));
}

function matchesCollectionIdentity(
  existing: StructuredValue<Record<string, unknown>>,
  incoming: StructuredValue<Record<string, unknown>>,
  definition: RecordDefinition
): boolean {
  if (definition.key) {
    const existingKey = readIdentityKey(existing, definition.key);
    const incomingKey = readIdentityKey(incoming, definition.key);
    return Boolean(existingKey && incomingKey && existingKey === incomingKey);
  }
  const existingCanonical = encodeCanonicalValue(existing);
  const incomingCanonical = encodeCanonicalValue(incoming);
  return Boolean(existingCanonical && incomingCanonical && existingCanonical === incomingCanonical);
}

function assertFromConstraint(
  env: Environment,
  shelf: ShelfDefinition,
  slotName: string,
  item: StructuredValue<Record<string, unknown>>
): void {
  const slot = shelf.slots[slotName];
  if (!slot.from) {
    return;
  }
  const sourceSlot = shelf.slots[slot.from];
  if (!sourceSlot) {
    throw new MlldInterpreterError(
      `Slot '@${shelf.name}.${slotName}' references unknown source slot '${slot.from}'`,
      'shelf',
      slot.location,
      { code: 'INVALID_SHELF_SLOT' }
    );
  }
  const recordDefinition = env.getRecordDefinition(slot.record);
  if (!recordDefinition) {
    throw new MlldInterpreterError(
      `Record '@${slot.record}' is not defined`,
      'shelf',
      slot.location,
      { code: 'UNKNOWN_SHELF_RECORD' }
    );
  }
  const sourceItems = normalizeStoredCollection(env.readShelfSlot(shelf.name, slot.from));
  const found = sourceItems.some(candidate => matchesCollectionIdentity(candidate, item, recordDefinition));
  if (!found) {
    throw new MlldSecurityError(
      `Value for slot '@${shelf.name}.${slotName}' must already exist in '@${shelf.name}.${slot.from}'`,
      {
        code: 'SHELF_FROM_NOT_FOUND',
        details: {
          slot: `@${shelf.name}.${slotName}`,
          from: `@${shelf.name}.${slot.from}`
        }
      }
    );
  }
}

function mergeCollectionItems(
  existing: StructuredValue<Record<string, unknown>>[],
  incoming: StructuredValue<Record<string, unknown>>[],
  definition: RecordDefinition,
  merge: ShelfMergeMode
): StructuredValue<Record<string, unknown>>[] {
  if (merge === 'append') {
    return [...existing, ...incoming];
  }
  if (merge === 'replace') {
    return [...incoming];
  }

  const next = [...existing];
  for (const item of incoming) {
    const index = next.findIndex(candidate => matchesCollectionIdentity(candidate, item, definition));
    if (index >= 0) {
      next[index] = item;
    } else {
      next.push(item);
    }
  }
  return next;
}

function collectShelfRecordDefinitions(
  env: Environment,
  definition: ShelfDefinition
): Record<string, RecordDefinition> {
  const records: Record<string, RecordDefinition> = {};
  for (const slot of Object.values(definition.slots)) {
    const record = env.getRecordDefinition(slot.record);
    if (record && !records[slot.record]) {
      records[slot.record] = record;
    }
  }
  return records;
}

function ensureShelfSlotAvailable(env: Environment, ref: ShelfScopeSlotRef): void {
  if (env.getShelfDefinition(ref.shelfName)?.slots[ref.slotName]) {
    return;
  }

  const shelfVar = env.getVariable(ref.shelfName);
  if (!shelfVar?.internal?.isShelf) {
    return;
  }

  const shelfDefinition = (shelfVar.internal as Record<string, unknown>).shelfDefinition as ShelfDefinition | undefined;
  const recordDefinitions =
    (shelfVar.internal as Record<string, unknown>).shelfRecordDefinitions as Record<string, RecordDefinition> | undefined;

  if (recordDefinitions) {
    for (const [recordName, definition] of Object.entries(recordDefinitions)) {
      if (!env.getRecordDefinition(recordName)) {
        env.registerRecordDefinition(recordName, definition);
      }
    }
  }

  if (shelfDefinition && !env.getShelfDefinition(shelfDefinition.name)) {
    env.registerShelfDefinition(shelfDefinition.name, shelfDefinition);
  }
}

export function extractShelfSlotRef(value: unknown): ShelfScopeSlotRef | undefined {
  if (isVariable(value)) {
    return extractShelfSlotRef(value.value);
  }
  if (!isShelfSlotRefValue(value)) {
    return undefined;
  }
  return {
    shelfName: value.shelfName,
    slotName: value.slotName
  };
}

function createShelfSlotReferenceValue(
  env: Environment,
  shelfName: string,
  slotName: string,
  options: {
    traceScope?: Partial<RuntimeTraceScope>;
  } = {}
): ShelfSlotRefValue {
  const definition = env.getShelfDefinition(shelfName);
  const slot = definition?.slots[slotName];
  const stored = env.readShelfSlot(shelfName, slotName, { traceScope: options.traceScope });
  const wrapped = stored === undefined
    ? (
        slot?.cardinality === 'collection'
          ? wrapStructured([], 'array')
          : wrapStructured(null)
      )
    : createStructuredSnapshot(stored);

  return createShelfSlotRefValue({ shelfName, slotName }, wrapped);
}

function createReadableShelfSlotReferenceValue(
  env: Environment,
  shelfName: string,
  slotName: string
): ShelfSlotRefValue {
  const live = createShelfSlotReferenceValue(env, shelfName, slotName);
  const projected = renderDisplayProjectionSync(live.current, env);
  return createShelfSlotRefValue(
    { shelfName, slotName },
    createStructuredSnapshot(projected)
  );
}

function getAllWritableSlots(env: Environment): ShelfScopeSlotRef[] {
  const scope = getNormalizedShelfScope(env);
  if (scope) {
    return [...scope.writeSlots];
  }

  const writable: ShelfScopeSlotRef[] = [];
  for (const [shelfName, definition] of env.getAllShelfDefinitions()) {
    for (const slotName of Object.keys(definition.slots)) {
      writable.push({ shelfName, slotName });
    }
  }
  return writable;
}

function getAllReadableSlots(env: Environment): ShelfScopeSlotRef[] {
  const scope = getNormalizedShelfScope(env);
  if (scope) {
    return [...scope.readSlots];
  }

  const readable: ShelfScopeSlotRef[] = [];
  for (const [shelfName, definition] of env.getAllShelfDefinitions()) {
    for (const slotName of Object.keys(definition.slots)) {
      readable.push({ shelfName, slotName });
    }
  }
  return readable;
}

function getAllReadableSlotBindings(env: Environment): ShelfScopeSlotBinding[] {
  const scope = getNormalizedShelfScope(env);
  if (scope) {
    return [...scope.readSlotBindings];
  }
  return getAllReadableSlots(env).map(ref => ({ ref }));
}

function getAllWritableSlotBindings(env: Environment): ShelfScopeSlotBinding[] {
  const scope = getNormalizedShelfScope(env);
  if (scope) {
    return [...scope.writeSlotBindings];
  }
  return getAllWritableSlots(env).map(ref => ({ ref }));
}

function formatSlotBindingAccessPath(binding: ShelfScopeSlotBinding): string {
  return binding.alias
    ? `@fyi.shelf.${binding.alias}`
    : `@fyi.shelf.${binding.ref.shelfName}.${binding.ref.slotName}`;
}

function assertShelfWriteAllowed(env: Environment, ref: ShelfScopeSlotRef): void {
  const scope = getNormalizedShelfScope(env);
  if (!scope) {
    return;
  }
  const allowed = scope.writeSlots.some(
    candidate => candidate.shelfName === ref.shelfName && candidate.slotName === ref.slotName
  );
  if (!allowed) {
    throw new MlldSecurityError(
      `Write access denied for shelf slot '@${ref.shelfName}.${ref.slotName}'`,
      {
        code: 'SHELF_WRITE_DENIED',
        details: { slot: `@${ref.shelfName}.${ref.slotName}` }
      }
    );
  }
}

function describeWritableSlots(env: Environment): string {
  const bindings = getAllWritableSlotBindings(env);
  if (bindings.length === 0) {
    return 'No writable shelf slots are available.';
  }
  return bindings
    .map(binding => {
      const shelf = env.getShelfDefinition(binding.ref.shelfName);
      const slot = shelf?.slots[binding.ref.slotName];
      const accessPath = formatSlotBindingAccessPath(binding);
      return slot
        ? `${accessPath} (${slot.record}${slot.cardinality === 'collection' ? '[]' : slot.optional ? '?' : ''}, ${slot.merge})`
        : accessPath;
    })
    .join(', ');
}

function describeReadableSlots(env: Environment): string {
  const bindings = getAllReadableSlotBindings(env);
  if (bindings.length === 0) {
    return 'No readable shelf slots are available.';
  }
  return bindings
    .map(binding => {
      const shelf = env.getShelfDefinition(binding.ref.shelfName);
      const slot = shelf?.slots[binding.ref.slotName];
      const accessPath = formatSlotBindingAccessPath(binding);
      return slot
        ? `${accessPath} (${slot.record}${slot.cardinality === 'collection' ? '[]' : slot.optional ? '?' : ''})`
        : accessPath;
    })
    .join(', ');
}

async function writeToShelfSlot(
  target: unknown,
  value: unknown,
  env: Environment,
  callLabel = '@shelve'
): Promise<StructuredValue> {
  const ref = extractShelfSlotRef(target);
  if (!ref) {
    throw new MlldInterpreterError(`The first ${callLabel} argument must be a shelf slot reference`, 'shelf', undefined, {
      code: 'INVALID_SHELF_REFERENCE'
    });
  }

  assertShelfWriteAllowed(env, ref);
  ensureShelfSlotAvailable(env, ref);

  const shelf = env.getShelfDefinition(ref.shelfName);
  const slot = shelf?.slots[ref.slotName];
  if (!shelf || !slot) {
    throw new MlldInterpreterError(`Unknown shelf slot '@${ref.shelfName}.${ref.slotName}'`, 'shelf', undefined, {
      code: 'INVALID_SHELF_REFERENCE'
    });
  }

  const recordDefinition = env.getRecordDefinition(slot.record);
  if (!recordDefinition) {
    throw new MlldInterpreterError(`Record '@${slot.record}' is not defined`, 'shelf', slot.location, {
      code: 'UNKNOWN_SHELF_RECORD'
    });
  }

  const strictFactInputs = Boolean(getNormalizedShelfScope(env));
  const extracted = extractRecordInputValue(value);
  const incomingItems = slot.cardinality === 'collection' && Array.isArray(extracted)
    ? extracted
    : [value];

  if (slot.cardinality === 'singular' && incomingItems.length !== 1) {
    throw new MlldInterpreterError(
      `Slot '@${ref.shelfName}.${ref.slotName}' accepts exactly one value`,
      'shelf',
      slot.location,
      { code: 'INVALID_SHELF_VALUE' }
    );
  }

  const validatedItems = await Promise.all(
    incomingItems.map(item =>
      validateShelfRecordValue({
        value: item,
        definition: recordDefinition,
        env,
        shelfName: ref.shelfName,
        slotName: ref.slotName,
        strictFactInputs
      })
    )
  );

  for (const item of validatedItems) {
    assertFromConstraint(env, shelf, ref.slotName, item);
  }

  const traceScope = { exe: callLabel };
  if (slot.cardinality === 'collection') {
    const current = normalizeStoredCollection(env.readShelfSlot(ref.shelfName, ref.slotName, { traceScope }));
    const next = mergeCollectionItems(current, validatedItems, recordDefinition, slot.merge);
    env.writeShelfSlot(ref.shelfName, ref.slotName, next, { traceScope });
  } else {
    env.writeShelfSlot(ref.shelfName, ref.slotName, validatedItems[0], { traceScope });
  }

  return createShelfSlotReferenceValue(env, ref.shelfName, ref.slotName, { traceScope });
}

async function readShelfSlot(
  target: unknown,
  env: Environment,
  callLabel = '@shelf.read'
): Promise<StructuredValue> {
  const ref = extractShelfSlotRef(target);
  if (!ref) {
    throw new MlldInterpreterError(`The first ${callLabel} argument must be a shelf slot reference`, 'shelf', undefined, {
      code: 'INVALID_SHELF_REFERENCE'
    });
  }

  ensureShelfSlotAvailable(env, ref);
  const traceScope = { exe: callLabel };

  return createShelfSlotReferenceValue(env, ref.shelfName, ref.slotName, { traceScope }).current;
}

async function clearShelfSlot(
  target: unknown,
  env: Environment,
  callLabel = '@shelf.clear'
): Promise<StructuredValue> {
  const ref = extractShelfSlotRef(target);
  if (!ref) {
    throw new MlldInterpreterError(`The first ${callLabel} argument must be a shelf slot reference`, 'shelf', undefined, {
      code: 'INVALID_SHELF_REFERENCE'
    });
  }
  ensureShelfSlotAvailable(env, ref);
  assertShelfWriteAllowed(env, ref);
  env.clearShelfSlot(ref.shelfName, ref.slotName, { traceScope: { exe: callLabel } });
  return createShelfSlotReferenceValue(env, ref.shelfName, ref.slotName, { traceScope: { exe: callLabel } });
}

async function removeFromShelfSlot(
  target: unknown,
  refValue: unknown,
  env: Environment,
  callLabel = '@shelf.remove'
): Promise<StructuredValue> {
  const slotRef = extractShelfSlotRef(target);
  if (!slotRef) {
    throw new MlldInterpreterError(`The first ${callLabel} argument must be a shelf slot reference`, 'shelf', undefined, {
      code: 'INVALID_SHELF_REFERENCE'
    });
  }
  ensureShelfSlotAvailable(env, slotRef);
  assertShelfWriteAllowed(env, slotRef);

  const shelf = env.getShelfDefinition(slotRef.shelfName);
  const slot = shelf?.slots[slotRef.slotName];
  if (!shelf || !slot || slot.cardinality !== 'collection') {
    throw new MlldInterpreterError(
      `${callLabel} only supports collection slots (got '@${slotRef.shelfName}.${slotRef.slotName}')`,
      'shelf',
      slot?.location,
      { code: 'INVALID_SHELF_REFERENCE' }
    );
  }

  const recordDefinition = env.getRecordDefinition(slot.record);
  if (!recordDefinition) {
    throw new MlldInterpreterError(`Record '@${slot.record}' is not defined`, 'shelf', slot.location, {
      code: 'UNKNOWN_SHELF_RECORD'
    });
  }

  const traceScope = { exe: callLabel };
  const current = normalizeStoredCollection(env.readShelfSlot(slotRef.shelfName, slotRef.slotName, { traceScope }));
  const resolvedRef = await resolveValueHandles(refValue, env);
  let next = current;

  if (recordDefinition.key) {
    let keyCandidate: string | undefined;
    const extracted = extractRecordInputValue(resolvedRef);
    if (
      isPlainObject(extracted)
      && Object.prototype.hasOwnProperty.call(extracted, recordDefinition.key)
    ) {
      keyCandidate = encodeCanonicalValue((extracted as Record<string, unknown>)[recordDefinition.key]);
    } else if (isStructuredValue(extracted)) {
      keyCandidate = encodeCanonicalValue(readStructuredFieldValue(extracted as any, recordDefinition.key));
    } else {
      keyCandidate = encodeCanonicalValue(extracted);
    }

    next = keyCandidate
      ? current.filter(item => readIdentityKey(item, recordDefinition.key!) !== keyCandidate)
      : current;
  } else {
    const candidate = encodeCanonicalValue(resolvedRef);
    next = candidate
      ? current.filter(item => encodeCanonicalValue(item) !== candidate)
      : current;
  }

  env.writeShelfSlot(slotRef.shelfName, slotRef.slotName, next, {
    traceEvent: 'shelf.remove',
    action: 'remove',
    traceScope,
    traceData: {
      removedCount: Math.max(0, current.length - next.length),
      ref: env.summarizeTraceValue(resolvedRef)
    }
  });
  return createShelfSlotReferenceValue(env, slotRef.shelfName, slotRef.slotName, { traceScope });
}

function defineEnumerableGetter(
  target: Record<string, unknown>,
  key: string,
  getter: () => unknown
): void {
  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: true,
    get: getter
  });
}

export function createShelfVariable(env: Environment, definition: ShelfDefinition): Variable {
  const value: Record<string, unknown> = Object.create(null);
  for (const slotName of Object.keys(definition.slots)) {
    defineEnumerableGetter(value, slotName, () =>
      createShelfSlotReferenceValue(env, definition.name, slotName)
    );
  }

  return createObjectVariable(definition.name, value, false, SHELF_VARIABLE_SOURCE, {
    internal: {
      isShelf: true,
      shelfName: definition.name,
      shelfDefinition: definition,
      shelfRecordDefinitions: collectShelfRecordDefinitions(env, definition)
    }
  });
}

function projectReadableValue(value: unknown, env: Environment): unknown {
  const ref = extractShelfSlotRef(value);
  if (ref) {
    return createReadableShelfSlotReferenceValue(env, ref.shelfName, ref.slotName);
  }
  return renderDisplayProjectionSync(value, env);
}

function createFyiShelfNamespaceValue(
  env: Environment,
  bindings: readonly ShelfScopeSlotBinding[]
): Record<string, unknown> {
  const value: Record<string, unknown> = Object.create(null);
  for (const binding of bindings) {
    const { shelfName, slotName } = binding.ref;
    defineEnumerableGetter(value, slotName, () =>
      projectReadableValue(createShelfSlotReferenceValue(env, shelfName, slotName), env)
    );
  }
  return value;
}

export function createFyiShelfValue(env: Environment): Record<string, unknown> {
  const value: Record<string, unknown> = Object.create(null);
  const scope = getNormalizedShelfScope(env);
  const readableBindings = scope?.readSlotBindings ?? getAllReadableSlots(env).map(ref => ({ ref }));
  const grouped = new Map<string, ShelfScopeSlotBinding[]>();
  for (const binding of readableBindings) {
    if (binding.alias) {
      continue;
    }
    const bucket = grouped.get(binding.ref.shelfName) ?? [];
    bucket.push(binding);
    grouped.set(binding.ref.shelfName, bucket);
  }

  for (const [shelfName, bindings] of grouped.entries()) {
    defineEnumerableGetter(value, shelfName, () =>
      createFyiShelfNamespaceValue(env, bindings)
    );
  }

  for (const binding of readableBindings) {
    if (!binding.alias) {
      continue;
    }
    defineEnumerableGetter(value, binding.alias, () =>
      projectReadableValue(createShelfSlotReferenceValue(env, binding.ref.shelfName, binding.ref.slotName), env)
    );
  }

  for (const [alias, aliasValue] of Object.entries(scope?.readAliases ?? {})) {
    defineEnumerableGetter(value, alias, () => projectReadableValue(aliasValue, env));
  }

  return value;
}

function looksLikeEnvironment(value: unknown): value is Environment {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Environment).getScopedEnvironmentConfig === 'function' &&
    typeof (value as Environment).getShelfDefinition === 'function'
  );
}

function createShelfWriteDefinition(env: Environment, name: 'shelve' | 'write'): NodeFunctionExecutable {
  const callLabel = name === 'shelve' ? '@shelve' : '@shelf.write';
  return {
    type: 'nodeFunction',
    name,
    fn: async (slotOrEnv?: unknown, valueOrEnv?: unknown, boundEnv?: Environment) => {
      const executionEnv = boundEnv
        ?? (looksLikeEnvironment(valueOrEnv) ? valueOrEnv : undefined)
        ?? (looksLikeEnvironment(slotOrEnv) ? slotOrEnv : undefined)
        ?? env;
      const slot = boundEnv || !looksLikeEnvironment(slotOrEnv) ? slotOrEnv : undefined;
      const value = boundEnv || !looksLikeEnvironment(valueOrEnv) ? valueOrEnv : undefined;
      return writeToShelfSlot(slot, value, executionEnv, callLabel);
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['slot', 'value'],
    description: `Write typed shelf slots. Writable slots: ${describeWritableSlots(env)}`
  };
}

function createShelfReadDefinition(env: Environment, callLabel = '@shelf.read'): NodeFunctionExecutable {
  return {
    type: 'nodeFunction',
    name: 'read',
    fn: async (slotOrEnv?: unknown, boundEnv?: Environment) => {
      const executionEnv = boundEnv
        ?? (looksLikeEnvironment(slotOrEnv) ? slotOrEnv : undefined)
        ?? env;
      const slot = boundEnv || !looksLikeEnvironment(slotOrEnv) ? slotOrEnv : undefined;
      return readShelfSlot(slot, executionEnv, callLabel);
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['slot'],
    description: `Read current shelf slot contents. Readable slots: ${describeReadableSlots(env)}`
  };
}

function createShelfClearDefinition(env: Environment, callLabel = '@shelf.clear'): NodeFunctionExecutable {
  return {
    type: 'nodeFunction',
    name: 'clear',
    fn: async (slotOrEnv?: unknown, boundEnv?: Environment) => {
      const executionEnv = boundEnv
        ?? (looksLikeEnvironment(slotOrEnv) ? slotOrEnv : undefined)
        ?? env;
      const slot = boundEnv || !looksLikeEnvironment(slotOrEnv) ? slotOrEnv : undefined;
      return clearShelfSlot(slot, executionEnv, callLabel);
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['slot'],
    description: `Clear writable shelf slots. Writable slots: ${describeWritableSlots(env)}`
  };
}

function createShelfRemoveDefinition(env: Environment, callLabel = '@shelf.remove'): NodeFunctionExecutable {
  return {
    type: 'nodeFunction',
    name: 'remove',
    fn: async (slotOrEnv?: unknown, refOrEnv?: unknown, boundEnv?: Environment) => {
      const executionEnv = boundEnv
        ?? (looksLikeEnvironment(refOrEnv) ? refOrEnv : undefined)
        ?? (looksLikeEnvironment(slotOrEnv) ? slotOrEnv : undefined)
        ?? env;
      const slot = boundEnv || !looksLikeEnvironment(slotOrEnv) ? slotOrEnv : undefined;
      const ref = boundEnv || !looksLikeEnvironment(refOrEnv) ? refOrEnv : undefined;
      return removeFromShelfSlot(slot, ref, executionEnv, callLabel);
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['slot', 'ref'],
    description: `Remove entities from writable collection slots. Writable slots: ${describeWritableSlots(env)}`
  };
}

function createShelfBuiltinExecutable(
  name: string,
  paramNames: string[],
  definition: NodeFunctionExecutable
): Variable {
  return createExecutableVariable(name, 'command', '', paramNames, undefined, SHELF_VARIABLE_SOURCE, {
    internal: {
      executableDef: definition,
      preserveStructuredArgs: true,
      isReserved: true,
      isSystem: true
    }
  });
}

export function createShelfBuiltinVariable(env: Environment): Variable {
  const writeDefinition = createShelfWriteDefinition(env, 'write');
  const readDefinition = createShelfReadDefinition(env);
  const clearDefinition = createShelfClearDefinition(env);
  const removeDefinition = createShelfRemoveDefinition(env);

  return createObjectVariable(
    'shelf',
    {
      write: createShelfBuiltinExecutable('write', ['slot', 'value'], writeDefinition),
      read: createShelfBuiltinExecutable('read', ['slot'], readDefinition),
      clear: createShelfBuiltinExecutable('clear', ['slot'], clearDefinition),
      remove: createShelfBuiltinExecutable('remove', ['slot', 'ref'], removeDefinition)
    },
    false,
    SHELF_VARIABLE_SOURCE,
    {
      internal: {
        isReserved: true,
        isSystem: true
      }
    }
  );
}

export function createShelveVariable(env: Environment): Variable {
  const writeDefinition = createShelfWriteDefinition(env, 'shelve');
  const clearDefinition = createShelfClearDefinition(env, '@shelve.clear');
  const readDefinition = createShelfReadDefinition(env, '@shelve.read');
  const removeDefinition = createShelfRemoveDefinition(env, '@shelve.remove');

  const clearExecutable = createShelfBuiltinExecutable('clear', ['slot'], clearDefinition);
  const readExecutable = createShelfBuiltinExecutable('read', ['slot'], readDefinition);
  const removeExecutable = createShelfBuiltinExecutable('remove', ['slot', 'ref'], removeDefinition);

  const value: Record<string, unknown> = Object.create(null);
  Object.defineProperties(value, {
    __executable: {
      value: true,
      enumerable: false,
      configurable: true
    },
    name: {
      value: 'shelve',
      enumerable: false,
      configurable: true
    },
    paramNames: {
      value: ['slot', 'value'],
      enumerable: false,
      configurable: true
    },
    executableDef: {
      value: writeDefinition,
      enumerable: false,
      configurable: true
    },
    internal: {
      value: {
        preserveStructuredArgs: true,
        isReserved: true,
        isSystem: true
      },
      enumerable: false,
      configurable: true
    }
  });
  value.clear = clearExecutable;
  value.read = readExecutable;
  value.remove = removeExecutable;

  return createObjectVariable('shelve', value, false, SHELF_VARIABLE_SOURCE, {
    internal: {
      isReserved: true,
      isSystem: true
    }
  });
}

type WritableShelfAliasBinding = {
  alias: string;
  ref: ShelfScopeSlotRef;
};

function getWritableShelfAliasBindings(env: Environment): WritableShelfAliasBinding[] {
  const scope = getNormalizedShelfScope(env);
  if (!scope) {
    return [];
  }

  const seen = new Set<string>();
  const bindings: WritableShelfAliasBinding[] = [];
  for (const binding of scope.writeSlotBindings) {
    const alias = typeof binding.alias === 'string' && binding.alias.trim().length > 0
      ? binding.alias.trim()
      : `${binding.ref.shelfName}.${binding.ref.slotName}`;
    if (seen.has(alias)) {
      continue;
    }
    seen.add(alias);
    bindings.push({ alias, ref: binding.ref });
  }
  return bindings;
}

function normalizeWritableShelfAliasInput(value: unknown): string | undefined {
  let resolved = value;
  if (isVariable(resolved)) {
    resolved = resolved.value;
  }
  if (isStructuredValue(resolved)) {
    resolved = asData(resolved);
  }
  if (typeof resolved !== 'string') {
    return undefined;
  }
  const trimmed = resolved.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createAutoProvisionedShelveExecutable(env: Environment): Variable | undefined {
  const aliasBindings = getWritableShelfAliasBindings(env);
  if (aliasBindings.length === 0) {
    return undefined;
  }

  const aliasNames = aliasBindings.map(binding => binding.alias);
  const aliasMap = new Map(aliasBindings.map(binding => [binding.alias, binding.ref]));
  const description = `Write typed shelf slots by alias. Writable aliases: ${aliasNames.join(', ')}`;

  const definition: NodeFunctionExecutable = {
    type: 'nodeFunction',
    name: 'shelve',
    fn: async (slotAliasOrEnv?: unknown, valueOrEnv?: unknown, boundEnv?: Environment) => {
      const executionEnv = boundEnv
        ?? (looksLikeEnvironment(valueOrEnv) ? valueOrEnv : undefined)
        ?? (looksLikeEnvironment(slotAliasOrEnv) ? slotAliasOrEnv : undefined)
        ?? env;
      const slotAlias = boundEnv || !looksLikeEnvironment(slotAliasOrEnv) ? slotAliasOrEnv : undefined;
      const value = boundEnv || !looksLikeEnvironment(valueOrEnv) ? valueOrEnv : undefined;
      const normalizedAlias = normalizeWritableShelfAliasInput(slotAlias);
      const ref = normalizedAlias ? aliasMap.get(normalizedAlias) : undefined;
      if (!ref) {
        const detail = normalizedAlias === undefined
          ? 'The first @shelve argument must be a writable slot alias'
          : `Unknown writable slot alias '${String(normalizedAlias)}'`;
        throw new MlldInterpreterError(
          `${detail}. Allowed aliases: ${aliasNames.join(', ')}`,
          'shelf',
          undefined,
          { code: 'INVALID_SHELF_REFERENCE' }
        );
      }
      return writeToShelfSlot(
        createShelfSlotReferenceValue(executionEnv, ref.shelfName, ref.slotName),
        value,
        executionEnv,
        '@shelve'
      );
    },
    bindExecutionEnv: true,
    sourceDirective: 'exec',
    paramNames: ['slot_alias', 'value'],
    paramTypes: {
      slot_alias: 'string',
      value: 'object'
    },
    description
  };
  (definition as any).paramSchemas = {
    slot_alias: {
      type: 'string',
      description: 'Writable shelf slot alias from the surrounding box scope',
      enum: aliasNames
    },
    value: {
      type: 'object',
      description: 'Record object to write to the selected shelf slot'
    }
  };

  return createExecutableVariable('shelve', 'command', '', ['slot_alias', 'value'], undefined, SHELF_VARIABLE_SOURCE, {
    internal: {
      executableDef: definition,
      preserveStructuredArgs: true,
      isReserved: true,
      isSystem: true
    }
  });
}

function normalizeScopeSlotRef(ref: ShelfScopeSlotRef): string {
  return `${ref.shelfName}.${ref.slotName}`;
}

function dedupeScopeRefs(refs: ShelfScopeSlotRef[]): ShelfScopeSlotRef[] {
  const seen = new Set<string>();
  const deduped: ShelfScopeSlotRef[] = [];
  for (const ref of refs) {
    const key = normalizeScopeSlotRef(ref);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(ref);
  }
  return deduped;
}

function normalizeScopeBindingRef(binding: ShelfScopeSlotBinding): string {
  return normalizeScopeSlotRef(binding.ref);
}

function dedupeScopeBindings(bindings: ShelfScopeSlotBinding[]): ShelfScopeSlotBinding[] {
  const seen = new Set<string>();
  const deduped: ShelfScopeSlotBinding[] = [];
  for (const binding of bindings) {
    const key = `${normalizeScopeBindingRef(binding)}::${binding.alias ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(binding);
  }
  return deduped;
}

function validateScopeSlotBindingTargets(
  bindings: readonly ShelfScopeSlotBinding[],
  env: Environment
): void {
  for (const binding of bindings) {
    const shelf = env.getShelfDefinition(binding.ref.shelfName);
    const slot = shelf?.slots[binding.ref.slotName];
    if (!shelf || !slot) {
      throw new MlldInterpreterError(
        `Unknown shelf slot '@${binding.ref.shelfName}.${binding.ref.slotName}'`,
        'box',
        undefined,
        { code: 'INVALID_SHELF_SCOPE' }
      );
    }
  }
}

function validateScopeSlotBindingConflicts(
  readBindings: readonly ShelfScopeSlotBinding[],
  writeBindings: readonly ShelfScopeSlotBinding[],
  readAliases: Readonly<Record<string, unknown>>
): void {
  const bindingByRef = new Map<string, ShelfScopeSlotBinding>();
  const aliasRefs = new Map<string, string>();
  const namespaceNames = new Set<string>();

  for (const binding of [...readBindings, ...writeBindings]) {
    const refKey = normalizeScopeBindingRef(binding);
    const existing = bindingByRef.get(refKey);
    if (existing) {
      if ((existing.alias ?? null) !== (binding.alias ?? null)) {
        throw new MlldInterpreterError(
          `Shelf slot '@${binding.ref.shelfName}.${binding.ref.slotName}' cannot be exposed under multiple agent names`,
          'box',
          undefined,
          { code: 'INVALID_SHELF_SCOPE' }
        );
      }
    } else {
      bindingByRef.set(refKey, binding);
    }

    if (binding.alias) {
      const existingAliasRef = aliasRefs.get(binding.alias);
      if (existingAliasRef && existingAliasRef !== refKey) {
        throw new MlldInterpreterError(
          `Shelf alias '${binding.alias}' is already bound to a different slot`,
          'box',
          undefined,
          { code: 'INVALID_SHELF_SCOPE' }
        );
      }
      aliasRefs.set(binding.alias, refKey);
    } else {
      namespaceNames.add(binding.ref.shelfName);
    }
  }

  for (const alias of Object.keys(readAliases)) {
    if (aliasRefs.has(alias)) {
      throw new MlldInterpreterError(
        `Shelf alias '${alias}' is already bound to a slot`,
        'box',
        undefined,
        { code: 'INVALID_SHELF_SCOPE' }
      );
    }
  }

  for (const alias of [...aliasRefs.keys(), ...Object.keys(readAliases)]) {
    if (namespaceNames.has(alias)) {
      throw new MlldInterpreterError(
        `Shelf alias '${alias}' conflicts with an exposed shelf namespace`,
        'box',
        undefined,
        { code: 'INVALID_SHELF_SCOPE' }
      );
    }
  }
}

function mergeReadableSlotBindings(
  readBindings: readonly ShelfScopeSlotBinding[],
  writeBindings: readonly ShelfScopeSlotBinding[]
): ShelfScopeSlotBinding[] {
  const merged = new Map<string, ShelfScopeSlotBinding>();
  for (const binding of [...readBindings, ...writeBindings]) {
    const key = normalizeScopeBindingRef(binding);
    if (!merged.has(key)) {
      merged.set(key, binding);
    }
  }
  return Array.from(merged.values());
}

function isAliasedValue(value: unknown): value is DataAliasedValue {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as DataAliasedValue).type === 'aliasedValue' &&
    typeof (value as DataAliasedValue).alias === 'string'
  );
}

async function normalizeScopeEntryValue(value: unknown, env: Environment): Promise<unknown> {
  if (isAliasedValue(value)) {
    return {
      alias: value.alias,
      value: await evaluateDataValue(value.value as DataValue, env, { suppressErrors: false })
    };
  }
  return value;
}

type ScopeAliasEntry = {
  alias: string;
  value: unknown;
};

function isNameRefScopeEntry(value: unknown): value is { name: string; ref: unknown } {
  if (!isPlainObject(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return (
    keys.length === 2 &&
    keys.includes('name') &&
    keys.includes('ref') &&
    typeof value.name === 'string'
  );
}

function extractNamedScopeEntries(value: unknown): ScopeAliasEntry[] | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  if (typeof value.alias === 'string' && 'value' in value) {
    return [{ alias: value.alias, value: value.value }];
  }

  if (isNameRefScopeEntry(value)) {
    return [{ alias: value.name, value: value.ref }];
  }

  return Object.keys(value).map(alias => ({
    alias,
    value: value[alias]
  }));
}

function applyNamedScopeEntry(
  entry: ScopeAliasEntry,
  label: 'read' | 'write',
  refs: ShelfScopeSlotRef[],
  bindings: ShelfScopeSlotBinding[],
  aliases: Record<string, unknown>
): void {
  const alias = entry.alias.trim();
  if (!alias) {
    throw new MlldInterpreterError(`box.shelf.${label} aliases must be non-empty`, 'box', undefined, {
      code: 'INVALID_SHELF_SCOPE'
    });
  }

  const ref = extractShelfSlotRef(entry.value);
  if (ref) {
    refs.push(ref);
    bindings.push({ ref, alias });
    return;
  }

  if (label === 'write') {
    throw new MlldInterpreterError(
      'box.shelf.write aliases must resolve to shelf slot references',
      'box',
      undefined,
      { code: 'INVALID_SHELF_SCOPE' }
    );
  }

  aliases[alias] = entry.value;
}

function applyScopeEntry(
  entry: unknown,
  label: 'read' | 'write',
  refs: ShelfScopeSlotRef[],
  bindings: ShelfScopeSlotBinding[],
  aliases: Record<string, unknown>
): void {
  const namedEntries = extractNamedScopeEntries(entry);
  if (namedEntries) {
    for (const namedEntry of namedEntries) {
      applyNamedScopeEntry(namedEntry, label, refs, bindings, aliases);
    }
    return;
  }

  const ref = extractShelfSlotRef(entry);
  if (!ref) {
    throw new MlldInterpreterError(
      `box.shelf.${label} entries must be shelf slot references${label === 'read' ? ', alias objects, or aliased values' : ' or alias objects'}`,
      'box',
      undefined,
      { code: 'INVALID_SHELF_SCOPE' }
    );
  }

  refs.push(ref);
  bindings.push({ ref });
}

async function normalizeScopeSlotEntries(
  entries: unknown,
  env: Environment,
  label: 'read' | 'write'
): Promise<{ refs: ShelfScopeSlotRef[]; bindings: ShelfScopeSlotBinding[]; aliases: Record<string, unknown> }> {
  if (entries === undefined) {
    return { refs: [], bindings: [], aliases: {} };
  }

  const refs: ShelfScopeSlotRef[] = [];
  const bindings: ShelfScopeSlotBinding[] = [];
  const aliases: Record<string, unknown> = {};

  if (Array.isArray(entries)) {
    for (const entry of entries) {
      const normalized = await normalizeScopeEntryValue(entry, env);
      applyScopeEntry(normalized, label, refs, bindings, aliases);
    }
    return { refs, bindings, aliases };
  }

  const normalized = await normalizeScopeEntryValue(entries, env);
  if (!isPlainObject(normalized)) {
    throw new MlldInterpreterError(`box.shelf.${label} must be an array or object`, 'box', undefined, {
      code: 'INVALID_SHELF_SCOPE'
    });
  }

  applyScopeEntry(normalized, label, refs, bindings, aliases);
  return { refs, bindings, aliases };
}

export async function normalizeScopedShelfConfig(
  value: unknown,
  env: Environment
): Promise<NormalizedShelfScope> {
  if (value === undefined) {
    return {
      [SHELF_SCOPE_MARKER]: true,
      readSlots: [],
      writeSlots: [],
      readAliases: {},
      readSlotBindings: [],
      writeSlotBindings: []
    };
  }
  if (!isPlainObject(value)) {
    throw new MlldInterpreterError('box.shelf must be an object', 'box', undefined, {
      code: 'INVALID_SHELF_SCOPE'
    });
  }

  const read = await normalizeScopeSlotEntries(value.read, env, 'read');
  const write = await normalizeScopeSlotEntries(value.write, env, 'write');
  const dedupedReadBindings = dedupeScopeBindings(read.bindings);
  const dedupedWriteBindings = dedupeScopeBindings(write.bindings);
  validateScopeSlotBindingTargets([...dedupedReadBindings, ...dedupedWriteBindings], env);
  validateScopeSlotBindingConflicts(dedupedReadBindings, dedupedWriteBindings, read.aliases);
  const mergedReadableBindings = mergeReadableSlotBindings(dedupedReadBindings, dedupedWriteBindings);

  return {
    [SHELF_SCOPE_MARKER]: true,
    readSlots: dedupeScopeRefs([...read.refs, ...write.refs]),
    writeSlots: dedupeScopeRefs(write.refs),
    readAliases: { ...read.aliases },
    readSlotBindings: mergedReadableBindings,
    writeSlotBindings: dedupedWriteBindings
  };
}

export function getNormalizedShelfScope(env: Environment): NormalizedShelfScope | undefined {
  const scopedConfig = env.getScopedEnvironmentConfig();
  const shelf = scopedConfig?.shelf;
  return isNormalizedShelfScope(shelf) ? shelf : undefined;
}

export function serializeShelfDefinition(
  env: Environment,
  definition: ShelfDefinition
): SerializedShelfDefinition {
  const records = Object.fromEntries(
    Array.from(new Set(Object.values(definition.slots).map(slot => slot.record)))
      .map(recordName => [recordName, env.getRecordDefinition(recordName)])
      .filter((entry): entry is [string, RecordDefinition] => Boolean(entry[1]))
  );

  return {
    __shelf: true,
    definition,
    ...(Object.keys(records).length > 0 ? { records } : {})
  };
}

export function isSerializedShelfDefinition(value: unknown): value is SerializedShelfDefinition {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as SerializedShelfDefinition).__shelf === true &&
    (value as SerializedShelfDefinition).definition
  );
}
