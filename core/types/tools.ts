/**
 * Tool collection type definitions for MCP tool gateway.
 */

import type {
  RecordDataTrustLevel,
  RecordFieldClassification,
  RecordFieldValueType,
  RecordPolicySetTarget
} from './record';

export interface ToolInputFieldSchema {
  name: string;
  classification: RecordFieldClassification;
  valueType?: RecordFieldValueType;
  optional: boolean;
  dataTrust?: RecordDataTrustLevel;
}

export interface ToolInputSchema {
  recordName: string;
  fields: ToolInputFieldSchema[];
  factFields: string[];
  dataFields: string[];
  visibleParams: string[];
  optionalParams: string[];
  exactFields: string[];
  updateFields: string[];
  allowlist: Record<string, RecordPolicySetTarget>;
  blocklist: Record<string, RecordPolicySetTarget>;
  optionalBenignFields: string[];
  correlate: boolean;
  declaredCorrelate?: boolean;
}

export type ToolAuthorizableValue = false | string | string[];

export interface ToolDefinition {
  mlld?: string;
  inputs?: string;
  labels?: string[];
  description?: string;
  instructions?: string;
  authorizable?: ToolAuthorizableValue;
  bind?: Record<string, unknown>;
  expose?: string[];
  optional?: string[];
  controlArgs?: string[];
  updateArgs?: string[];
  exactPayloadArgs?: string[];
  sourceArgs?: string[];
  correlateControlArgs?: boolean;
}

export type ToolCollection = Record<string, ToolDefinition>;

export interface ToolAuthorizationContextEntry {
  params: string[];
  inputSchema?: ToolInputSchema;
  controlArgs?: string[];
  hasControlArgsMetadata?: boolean;
  updateArgs?: string[];
  hasUpdateArgsMetadata?: boolean;
  exactPayloadArgs?: string[];
  sourceArgs?: string[];
  labels?: string[];
  description?: string;
  instructions?: string;
  authorizable?: ToolAuthorizableValue;
  correlateControlArgs?: boolean;
}

export type ToolCollectionAuthorizationContext = Record<string, ToolAuthorizationContextEntry>;

export interface ToolCollectionMetadata {
  auth?: ToolCollectionAuthorizationContext;
}

const TOOL_COLLECTION_METADATA = Symbol.for('mlld.toolCollectionMetadata');

export const TOOL_COLLECTION_METADATA_EXPORT_KEY = '__mlld_tool_collection_metadata__';
export const TOOL_COLLECTION_CAPTURED_MODULE_ENV_EXPORT_KEY = '__mlld_tool_collection_captured_module_env__';

function cloneStringList(values: readonly string[]): string[] {
  return values
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map(entry => entry.trim());
}

function cloneToolInputSchemaField(field: ToolInputFieldSchema): ToolInputFieldSchema {
  return {
    name: field.name,
    classification: field.classification,
    ...(field.valueType ? { valueType: field.valueType } : {}),
    optional: field.optional === true,
    ...(field.dataTrust ? { dataTrust: field.dataTrust } : {})
  };
}

function cloneRecordPolicySetTarget(target: RecordPolicySetTarget): RecordPolicySetTarget {
  if (target.kind === 'reference') {
    return {
      kind: 'reference',
      name: target.name
    };
  }

  return {
    kind: 'array',
    values: [...target.values]
  };
}

export function cloneToolInputSchema(schema: ToolInputSchema): ToolInputSchema {
  return {
    recordName: schema.recordName,
    fields: schema.fields.map(cloneToolInputSchemaField),
    factFields: cloneStringList(schema.factFields),
    dataFields: cloneStringList(schema.dataFields),
    visibleParams: cloneStringList(schema.visibleParams),
    optionalParams: cloneStringList(schema.optionalParams),
    exactFields: cloneStringList(schema.exactFields),
    updateFields: cloneStringList(schema.updateFields),
    allowlist: Object.fromEntries(
      Object.entries(schema.allowlist).map(([fieldName, target]) => [
        fieldName,
        cloneRecordPolicySetTarget(target)
      ])
    ),
    blocklist: Object.fromEntries(
      Object.entries(schema.blocklist).map(([fieldName, target]) => [
        fieldName,
        cloneRecordPolicySetTarget(target)
      ])
    ),
    optionalBenignFields: cloneStringList(schema.optionalBenignFields),
    correlate: schema.correlate === true,
    ...(schema.declaredCorrelate !== undefined
      ? { declaredCorrelate: schema.declaredCorrelate === true }
      : {})
  };
}

function isRecordPolicySetTarget(value: unknown): value is RecordPolicySetTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<RecordPolicySetTarget>;
  if (candidate.kind === 'reference') {
    return typeof (candidate as { name?: unknown }).name === 'string';
  }
  if (candidate.kind === 'array') {
    return Array.isArray((candidate as { values?: unknown }).values);
  }
  return false;
}

function isToolInputFieldSchema(value: unknown): value is ToolInputFieldSchema {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<ToolInputFieldSchema>;
  return (
    typeof candidate.name === 'string' &&
    (candidate.classification === 'fact' || candidate.classification === 'data') &&
    typeof candidate.optional === 'boolean' &&
    (candidate.valueType === undefined
      || candidate.valueType === 'string'
      || candidate.valueType === 'number'
      || candidate.valueType === 'boolean'
      || candidate.valueType === 'array'
      || candidate.valueType === 'object'
      || candidate.valueType === 'handle') &&
    (candidate.dataTrust === undefined || candidate.dataTrust === 'trusted' || candidate.dataTrust === 'untrusted')
  );
}

export function isToolInputSchema(value: unknown): value is ToolInputSchema {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<ToolInputSchema>;
  return (
    typeof candidate.recordName === 'string' &&
    Array.isArray(candidate.fields) &&
    candidate.fields.every(isToolInputFieldSchema) &&
    Array.isArray(candidate.factFields) &&
    candidate.factFields.every(entry => typeof entry === 'string') &&
    Array.isArray(candidate.dataFields) &&
    candidate.dataFields.every(entry => typeof entry === 'string') &&
    Array.isArray(candidate.visibleParams) &&
    candidate.visibleParams.every(entry => typeof entry === 'string') &&
    Array.isArray(candidate.optionalParams) &&
    candidate.optionalParams.every(entry => typeof entry === 'string') &&
    Array.isArray(candidate.exactFields) &&
    candidate.exactFields.every(entry => typeof entry === 'string') &&
    Array.isArray(candidate.updateFields) &&
    candidate.updateFields.every(entry => typeof entry === 'string') &&
    !!candidate.allowlist &&
    typeof candidate.allowlist === 'object' &&
    !Array.isArray(candidate.allowlist) &&
    Object.values(candidate.allowlist).every(isRecordPolicySetTarget) &&
    !!candidate.blocklist &&
    typeof candidate.blocklist === 'object' &&
    !Array.isArray(candidate.blocklist) &&
    Object.values(candidate.blocklist).every(isRecordPolicySetTarget) &&
    Array.isArray(candidate.optionalBenignFields) &&
    candidate.optionalBenignFields.every(entry => typeof entry === 'string') &&
    typeof candidate.correlate === 'boolean' &&
    (candidate.declaredCorrelate === undefined || typeof candidate.declaredCorrelate === 'boolean')
  );
}

export function normalizeToolAuthorizableValue(
  value: unknown
): ToolAuthorizableValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === false) {
    return false;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = cloneStringList(value);
  return normalized.length > 0 ? normalized : undefined;
}

function isAuthorizationContextEntry(value: unknown): value is ToolAuthorizationContextEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<ToolAuthorizationContextEntry>;
  return (
    Array.isArray(candidate.params)
    && candidate.params.every(entry => typeof entry === 'string')
    && (candidate.inputSchema === undefined || isToolInputSchema(candidate.inputSchema))
    && (candidate.controlArgs === undefined
      || (Array.isArray(candidate.controlArgs) && candidate.controlArgs.every(entry => typeof entry === 'string')))
    && (candidate.hasControlArgsMetadata === undefined || typeof candidate.hasControlArgsMetadata === 'boolean')
    && (candidate.updateArgs === undefined
      || (Array.isArray(candidate.updateArgs) && candidate.updateArgs.every(entry => typeof entry === 'string')))
    && (candidate.hasUpdateArgsMetadata === undefined || typeof candidate.hasUpdateArgsMetadata === 'boolean')
    && (candidate.exactPayloadArgs === undefined
      || (Array.isArray(candidate.exactPayloadArgs) && candidate.exactPayloadArgs.every(entry => typeof entry === 'string')))
    && (candidate.sourceArgs === undefined
      || (Array.isArray(candidate.sourceArgs) && candidate.sourceArgs.every(entry => typeof entry === 'string')))
    && (candidate.labels === undefined
      || (Array.isArray(candidate.labels) && candidate.labels.every(entry => typeof entry === 'string')))
    && (candidate.description === undefined || typeof candidate.description === 'string')
    && (candidate.instructions === undefined || typeof candidate.instructions === 'string')
    && (candidate.correlateControlArgs === undefined || typeof candidate.correlateControlArgs === 'boolean')
    && (
      candidate.authorizable === undefined
      || candidate.authorizable === false
      || typeof candidate.authorizable === 'string'
      || (Array.isArray(candidate.authorizable) && candidate.authorizable.every(entry => typeof entry === 'string'))
    )
  );
}

export function isToolCollectionAuthorizationContext(
  value: unknown
): value is ToolCollectionAuthorizationContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(entry => isAuthorizationContextEntry(entry));
}

export function cloneToolCollectionAuthorizationContext(
  context: ToolCollectionAuthorizationContext
): ToolCollectionAuthorizationContext {
  return Object.fromEntries(
    Object.entries(context).map(([toolName, entry]) => [
      toolName,
      {
        params: cloneStringList(entry.params),
        ...(entry.inputSchema
          ? { inputSchema: cloneToolInputSchema(entry.inputSchema) }
          : {}),
        ...(Array.isArray(entry.controlArgs)
          ? { controlArgs: cloneStringList(entry.controlArgs) }
          : {}),
        ...(entry.hasControlArgsMetadata !== undefined
          ? { hasControlArgsMetadata: entry.hasControlArgsMetadata === true }
          : {}),
        ...(Array.isArray(entry.updateArgs)
          ? { updateArgs: cloneStringList(entry.updateArgs) }
          : {}),
        ...(entry.hasUpdateArgsMetadata !== undefined
          ? { hasUpdateArgsMetadata: entry.hasUpdateArgsMetadata === true }
          : {}),
        ...(Array.isArray(entry.exactPayloadArgs)
          ? { exactPayloadArgs: cloneStringList(entry.exactPayloadArgs) }
          : {}),
        ...(Array.isArray(entry.sourceArgs)
          ? { sourceArgs: cloneStringList(entry.sourceArgs) }
          : {}),
        ...(Array.isArray(entry.labels)
          ? { labels: cloneStringList(entry.labels) }
          : {}),
        ...(typeof entry.description === 'string'
          ? { description: entry.description }
          : {}),
        ...(typeof entry.instructions === 'string'
          ? { instructions: entry.instructions }
          : {}),
        ...(entry.authorizable !== undefined
          ? {
              authorizable: Array.isArray(entry.authorizable)
                ? cloneStringList(entry.authorizable)
                : entry.authorizable
            }
          : {}),
        ...(entry.correlateControlArgs === true
          ? { correlateControlArgs: true }
          : {})
      }
    ])
  );
}

export function isToolCollectionMetadata(
  value: unknown
): value is ToolCollectionMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as ToolCollectionMetadata;
  return (
    candidate.auth === undefined
    || isToolCollectionAuthorizationContext(candidate.auth)
  );
}

export function cloneToolCollectionMetadata(
  metadata: ToolCollectionMetadata
): ToolCollectionMetadata {
  return {
    ...(metadata.auth
      ? { auth: cloneToolCollectionAuthorizationContext(metadata.auth) }
      : {})
  };
}

export function attachToolCollectionMetadata<T extends Record<string, unknown>>(
  collection: T,
  metadata: ToolCollectionMetadata
): T {
  Object.defineProperty(collection, TOOL_COLLECTION_METADATA, {
    value: cloneToolCollectionMetadata(metadata),
    enumerable: false,
    configurable: true,
    writable: true
  });
  return collection;
}

export function getToolCollectionMetadata(
  collection: unknown
): ToolCollectionMetadata | undefined {
  if (!collection || typeof collection !== 'object') {
    return undefined;
  }

  const candidate = (collection as Record<PropertyKey, unknown>)[TOOL_COLLECTION_METADATA];
  if (!isToolCollectionMetadata(candidate)) {
    return undefined;
  }

  return candidate;
}

export function takeSerializedToolCollectionMetadata(
  value: unknown
): ToolCollectionMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const container = value as Record<string, unknown>;
  const candidate = container[TOOL_COLLECTION_METADATA_EXPORT_KEY];
  delete container[TOOL_COLLECTION_METADATA_EXPORT_KEY];

  if (!isToolCollectionMetadata(candidate)) {
    return undefined;
  }

  return cloneToolCollectionMetadata(candidate);
}

export function takeSerializedToolCollectionCapturedModuleEnv(
  value: unknown
): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const container = value as Record<string, unknown>;
  const candidate = container[TOOL_COLLECTION_CAPTURED_MODULE_ENV_EXPORT_KEY];
  delete container[TOOL_COLLECTION_CAPTURED_MODULE_ENV_EXPORT_KEY];
  return candidate;
}

export function attachToolCollectionAuthorizationContext<T extends Record<string, unknown>>(
  collection: T,
  context: ToolCollectionAuthorizationContext
): T {
  const metadata = getToolCollectionMetadata(collection) ?? {};
  return attachToolCollectionMetadata(collection, {
    ...metadata,
    auth: context
  });
}

export function getToolCollectionAuthorizationContext(
  collection: unknown
): ToolCollectionAuthorizationContext | undefined {
  return getToolCollectionMetadata(collection)?.auth;
}

export function takeSerializedToolCollectionAuthorizationContext(
  value: unknown
): ToolCollectionAuthorizationContext | undefined {
  return takeSerializedToolCollectionMetadata(value)?.auth;
}
