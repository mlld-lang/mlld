/**
 * Tool collection type definitions for MCP tool gateway.
 */

export interface ToolDefinition {
  mlld?: string;
  labels?: string[];
  description?: string;
  bind?: Record<string, unknown>;
  expose?: string[];
  optional?: string[];
  controlArgs?: string[];
  updateArgs?: string[];
  exactPayloadArgs?: string[];
  correlateControlArgs?: boolean;
}

export type ToolCollection = Record<string, ToolDefinition>;

export interface ToolAuthorizationContextEntry {
  params: string[];
  controlArgs: string[];
  hasControlArgsMetadata: boolean;
  updateArgs?: string[];
  hasUpdateArgsMetadata?: boolean;
  exactPayloadArgs?: string[];
  labels?: string[];
  description?: string;
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

function isAuthorizationContextEntry(value: unknown): value is ToolAuthorizationContextEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<ToolAuthorizationContextEntry>;
  return (
    Array.isArray(candidate.params)
    && candidate.params.every(entry => typeof entry === 'string')
    && Array.isArray(candidate.controlArgs)
    && candidate.controlArgs.every(entry => typeof entry === 'string')
    && typeof candidate.hasControlArgsMetadata === 'boolean'
    && (candidate.updateArgs === undefined
      || (Array.isArray(candidate.updateArgs) && candidate.updateArgs.every(entry => typeof entry === 'string')))
    && (candidate.hasUpdateArgsMetadata === undefined || typeof candidate.hasUpdateArgsMetadata === 'boolean')
    && (candidate.exactPayloadArgs === undefined
      || (Array.isArray(candidate.exactPayloadArgs) && candidate.exactPayloadArgs.every(entry => typeof entry === 'string')))
    && (candidate.labels === undefined
      || (Array.isArray(candidate.labels) && candidate.labels.every(entry => typeof entry === 'string')))
    && (candidate.description === undefined || typeof candidate.description === 'string')
    && (candidate.correlateControlArgs === undefined || typeof candidate.correlateControlArgs === 'boolean')
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
        controlArgs: cloneStringList(entry.controlArgs),
        hasControlArgsMetadata: entry.hasControlArgsMetadata === true,
        ...(Array.isArray(entry.updateArgs)
          ? { updateArgs: cloneStringList(entry.updateArgs) }
          : {}),
        ...(entry.hasUpdateArgsMetadata !== undefined
          ? { hasUpdateArgsMetadata: entry.hasUpdateArgsMetadata === true }
          : {}),
        ...(Array.isArray(entry.exactPayloadArgs)
          ? { exactPayloadArgs: cloneStringList(entry.exactPayloadArgs) }
          : {}),
        ...(Array.isArray(entry.labels)
          ? { labels: cloneStringList(entry.labels) }
          : {}),
        ...(typeof entry.description === 'string'
          ? { description: entry.description }
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
