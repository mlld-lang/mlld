/**
 * Utility for accessing fields on objects/arrays
 */

import { FieldAccessNode } from '@core/types/primitives';
import { FieldAccessError } from '@core/errors';
import { isLoadContentResult, isLoadContentResultURL } from '@core/types/load-content';
import {
  deserializeSecurityDescriptor,
  mergeDescriptors,
  removeLabelsFromDescriptor,
  type SecurityDescriptor
} from '@core/types/security';
import { VariableMetadataUtils } from '@core/types/variable';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import {
  isGuardArgsView,
  resolveGuardArgsViewProperty
} from './guard-args';
import type { Variable } from '@core/types/variable/VariableTypes';
import path from 'node:path';
import { isVariable } from './variable-resolution';
import { ArrayOperationsHandler } from './array-operations';
import { Environment } from '@interpreter/env/Environment';
import { isNamespaceInternalField } from '../core/interpreter/namespace-shared';
import {
  hasDisplayProjectionTarget,
  issueProjectionHandleForValue,
  renderHandleProjectionSync
} from '@interpreter/eval/records/display-projection';
import {
  asData,
  isStructuredValue,
  extractSecurityDescriptor,
  applySecurityDescriptorToStructuredValue,
  setRecordProjectionMetadata,
  type StructuredValue
} from './structured-value';
import { isShelfSlotRefValue } from '@core/types/shelf';
import { wrapExecResult } from './structured-exec';
import { inheritExpressionProvenance, setExpressionProvenance } from '@core/types/provenance/ExpressionProvenance';
import type { DataObjectValue } from '@core/types/var';
import type { WorkspaceValue } from '@core/types/workspace';
import { isWorkspaceValue } from '@core/types/workspace';
import { getStaticObjectKey } from './object-compat';

const COMMON_FILE_EXTENSION_FIELDS = new Set([
  'json',
  'jsonl',
  'md',
  'txt',
  'mld',
  'csv',
  'yaml',
  'yml',
  'html',
  'css',
  'js',
  'ts',
  'py',
  'sh',
  'att',
  'mtt',
  'xml',
  'toml',
  'env',
  'log',
  'pdf'
]);

const WORKSPACE_MX_CONTEXT = Symbol('mlld.workspace-mx-context');
const OBJECT_UTILITY_MX_VIEW = Symbol('mlld.object-utility-mx-view');

interface WorkspaceMxContext {
  workspace?: WorkspaceValue;
  path?: string;
}

function buildFieldAccessReference(fieldName: string, options?: FieldAccessOptions): {
  parsed: string;
  escaped: string;
} {
  const base = options?.baseIdentifier ? `@${options.baseIdentifier}` : '@value';
  const parent = options?.parentPath?.length ? `.${options.parentPath.join('.')}` : '';
  const parsed = `${base}${parent}.${fieldName}`;
  const escaped = `${base}${parent}\\.${fieldName}`;
  return { parsed, escaped };
}

function getCommonExtensionFieldAccessHint(
  fieldName: string,
  options?: FieldAccessOptions
): string | null {
  if (!COMMON_FILE_EXTENSION_FIELDS.has(fieldName.toLowerCase())) {
    return null;
  }

  const { parsed, escaped } = buildFieldAccessReference(fieldName, options);
  return `'${parsed}' looks like field access. If you meant a file extension, escape the dot: '${escaped}'.`;
}

/**
 * Helper to get a field from an object AST node.
 * Handles both new entries format and old properties format.
 */
function getObjectField(obj: any, fieldName: string): any | undefined {
  // New format: entries array
  if (obj.entries && Array.isArray(obj.entries)) {
    for (const entry of obj.entries) {
      if (entry.type === 'pair' && getStaticObjectKey(entry.key) === fieldName) {
        return entry.value;
      }
    }
    return undefined;
  }

  // Old format: properties record (shouldn't happen with new grammar, but keep for safety)
  if (obj.properties && typeof obj.properties === 'object') {
    return obj.properties[fieldName];
  }

  return undefined;
}

/**
 * Helper to check if an object AST node has a specific field.
 */
function hasObjectField(obj: any, fieldName: string): boolean {
  // New format: entries array
  if (obj.entries && Array.isArray(obj.entries)) {
    return obj.entries.some((entry: any) => entry.type === 'pair' && getStaticObjectKey(entry.key) === fieldName);
  }

  // Old format: properties record
  if (obj.properties && typeof obj.properties === 'object') {
    return fieldName in obj.properties;
  }

  return false;
}

/**
 * Helper to check if a value is an object AST node.
 */
function isObjectAST(value: any): boolean {
  if (!value || typeof value !== 'object' || value.type !== 'object') {
    return false;
  }
  if ((value as Record<PropertyKey, unknown>)[OBJECT_UTILITY_MX_VIEW] === true) {
    return false;
  }

  if (Array.isArray(value.entries)) {
    return value.entries.every(
      (entry: any) =>
        entry &&
        typeof entry === 'object' &&
        ((entry.type === 'pair' && 'key' in entry && 'value' in entry) ||
          (entry.type === 'spread' && 'value' in entry))
    );
  }

  return Boolean(value.properties && typeof value.properties === 'object');
}

function isPlainObjectValue(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  if (isObjectAST(value)) {
    return false;
  }
  if (isLoadContentResult(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function createObjectUtilityMxView(
  mx: unknown,
  data: unknown,
  structured?: StructuredValue,
  parentVariable?: Variable,
  env?: Environment
): unknown {
  const workspaceContext = deriveWorkspaceMxContext(mx, data);
  const hasMxObject = Boolean(mx && typeof mx === 'object');
  const hasObjectUtilityData = isPlainObjectValue(data);
  const shelfDefinition =
    parentVariable?.internal?.isShelf === true &&
    parentVariable.internal &&
    typeof parentVariable.internal === 'object' &&
    'shelfDefinition' in parentVariable.internal
      ? (parentVariable.internal as Record<string, unknown>).shelfDefinition as
          | { slots?: Record<string, unknown> }
          | undefined
      : undefined;
  const shelfSlotNames = shelfDefinition?.slots ? Object.keys(shelfDefinition.slots) : [];
  const hasShelfMxAccessors = shelfSlotNames.length > 0;

  if (!structured && !hasObjectUtilityData && !workspaceContext && !hasShelfMxAccessors) {
    return mx;
  }

  const view = (hasMxObject
    ? Object.create(mx as object)
    : Object.create(null)) as Record<string, unknown>;

  if (structured) {
    Object.defineProperty(view, 'text', {
      value: structured.text,
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(view, 'data', {
      value: structured.data,
      enumerable: true,
      configurable: true
    });
  }

  if (env) {
    Object.defineProperty(view, 'handle', {
      enumerable: true,
      configurable: true,
      get: () => {
        if (structured) {
          return issueProjectionHandleForValue(env, structured, {
            nullOutsideBridge: true
          });
        }
        if (!env.getCurrentLlmSessionId()) {
          return null;
        }
        return env.issueHandle(data).handle;
      }
    });

    Object.defineProperty(view, 'handles', {
      enumerable: true,
      configurable: true,
      get: () => {
        const target = structured ?? data;
        return hasDisplayProjectionTarget(target)
          ? renderHandleProjectionSync(target, env)
          : null;
      }
    });
  }

  if (hasObjectUtilityData) {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);
    Object.defineProperty(view, 'keys', {
      value: keys,
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(view, 'values', {
      value: keys.map(key => obj[key]),
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(view, 'entries', {
      value: keys.map(key => [key, obj[key]]),
      enumerable: true,
      configurable: true
    });
  }

  if (hasShelfMxAccessors) {
    const shelfValue = data && typeof data === 'object'
      ? data as Record<string, unknown>
      : undefined;
    Object.defineProperty(view, 'slots', {
      value: shelfSlotNames,
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(view, 'slotEntries', {
      value: shelfSlotNames.map(name => ({
        name,
        ref: shelfValue?.[name]
      })),
      enumerable: true,
      configurable: true
    });
  }

  if (workspaceContext) {
    Object.defineProperty(view, WORKSPACE_MX_CONTEXT, {
      value: workspaceContext,
      enumerable: false,
      configurable: true
    });
  }

  Object.defineProperty(view, OBJECT_UTILITY_MX_VIEW, {
    value: true,
    enumerable: false,
    configurable: true
  });

  return view;
}

function readStringProperty(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : undefined;
}

async function resolveDeferredObjectFieldValue(
  value: unknown,
  env: Environment,
  sourceLocation?: SourceLocation
): Promise<unknown> {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return value;
  }

  if (isVariable(value)) {
    return value;
  }

  const node = value as Record<string, unknown>;
  const refNode =
    node.type === 'VariableReferenceWithTail' && node.variable && typeof node.variable === 'object'
      ? node.variable as Record<string, unknown>
      : node;

  const { evaluateDataValue } = await import('../eval/data-value-evaluator');

  if (refNode.type !== 'VariableReference' || typeof refNode.identifier !== 'string') {
    return evaluateDataValue(value as DataObjectValue, env);
  }

  const variable = env.getVariable(refNode.identifier);
  if (!variable) {
    throw new Error(`Variable not found: ${refNode.identifier}`);
  }
  const hasFields = Array.isArray(refNode.fields) && refNode.fields.length > 0;

  if (!hasFields) {
    if (node.type === 'VariableReference' && variable.internal?.isShelf === true) {
      const { resolveVariable, ResolutionContext } = await import('./variable-resolution');
      return resolveVariable(variable, env, ResolutionContext.ObjectProperty);
    }
    return evaluateDataValue(value as DataObjectValue, env);
  }

  const { resolveVariable, ResolutionContext } = await import('./variable-resolution');
  const resolved = await resolveVariable(variable, env, ResolutionContext.FieldAccess);
  const fieldResult = await accessFields(
    resolved,
    refNode.fields as FieldAccessNode[],
    {
      preserveContext: true,
      env,
      sourceLocation
    }
  ) as FieldAccessResult;

  if (isVariable(fieldResult.value) && fieldResult.value.internal?.isShelf === true) {
    return fieldResult.value;
  }

  return evaluateDataValue(value as DataObjectValue, env);
}

function deriveWorkspaceMxContext(mx: unknown, data: unknown): WorkspaceMxContext | undefined {
  const workspace = isWorkspaceValue(data) ? data : undefined;
  const path = readStringProperty(mx, 'path') ?? readStringProperty(data, 'path');
  if (!workspace && !path) {
    return undefined;
  }
  return {
    ...(workspace ? { workspace } : {}),
    ...(path ? { path } : {})
  };
}

function normalizeWorkspaceChangesForDisplay(
  changes: Array<{ path: string; type: string; entity: string }>,
  env?: Environment
): Array<{ path: string; type: string; entity: string }> {
  const projectRoot = env?.getProjectRoot?.();
  if (!projectRoot) {
    return changes;
  }
  const normalizedRoot = path.posix.normalize(String(projectRoot).replace(/\\/g, '/'));
  if (!normalizedRoot || normalizedRoot === '/') {
    return changes;
  }

  return changes.filter(change => {
    if (change.type !== 'created' || change.entity !== 'directory') {
      return true;
    }
    if (change.path === normalizedRoot) {
      return false;
    }
    return !normalizedRoot.startsWith(`${change.path}/`);
  });
}

function getWorkspaceMxContext(value: unknown): WorkspaceMxContext | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const context = (value as Record<PropertyKey, unknown>)[WORKSPACE_MX_CONTEXT];
  if (!context || typeof context !== 'object') {
    return undefined;
  }
  const record = context as Record<string, unknown>;
  const workspace = isWorkspaceValue(record.workspace) ? record.workspace : undefined;
  const path = typeof record.path === 'string' ? record.path : undefined;
  if (!workspace && !path) {
    return undefined;
  }
  return {
    ...(workspace ? { workspace } : {}),
    ...(path ? { path } : {})
  };
}

function getNamespaceMetadata(
  parentVariable: Variable | undefined,
  structuredWrapper: StructuredValue | undefined
) {
  const variableMetadata = parentVariable?.internal &&
    typeof parentVariable.internal === 'object' &&
    'namespaceMetadata' in parentVariable.internal
      ? (parentVariable.internal as Record<string, unknown>).namespaceMetadata
      : undefined;

  if (variableMetadata && typeof variableMetadata === 'object') {
    return variableMetadata;
  }

  const structuredMetadata = structuredWrapper?.internal &&
    typeof structuredWrapper.internal === 'object' &&
    'namespaceMetadata' in structuredWrapper.internal
      ? (structuredWrapper.internal as Record<string, unknown>).namespaceMetadata
      : undefined;

  return structuredMetadata;
}

function getFieldMetadata(
  parentVariable: Variable | undefined,
  structuredWrapper: StructuredValue | undefined,
  fieldName: string
) {
  const namespaceMetadata = getNamespaceMetadata(parentVariable, structuredWrapper);

  if (!namespaceMetadata || typeof namespaceMetadata !== 'object') {
    return undefined;
  }

  const serialized = (namespaceMetadata as Record<string, unknown>)[fieldName];
  if (!serialized || typeof serialized !== 'object') {
    return undefined;
  }

  const payload = serialized as Record<string, unknown>;
  const legacySecurity = VariableMetadataUtils.deserializeSecurityMetadata(
    payload as ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata>
  ).security;

  return {
    descriptor: legacySecurity ?? deserializeSecurityDescriptor(payload.security as any),
    factsources: Array.isArray(payload.factsources) ? payload.factsources : undefined,
    projection: payload.projection && typeof payload.projection === 'object'
      ? payload.projection
      : undefined
  };
}

function stripFactLabelsFromDescriptor(
  descriptor: SecurityDescriptor | undefined
): SecurityDescriptor | undefined {
  if (!descriptor) {
    return undefined;
  }

  const factLabels = [
    ...descriptor.labels.filter(label => label.startsWith('fact:')),
    ...descriptor.taint.filter(label => label.startsWith('fact:')),
    ...descriptor.attestations.filter(label => label.startsWith('fact:'))
  ];
  if (factLabels.length === 0) {
    return descriptor;
  }

  return removeLabelsFromDescriptor(descriptor, factLabels);
}

function isIgnorableWorkspaceDiffError(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code;
  return code === 'ENOENT' || code === 'EISDIR';
}

function collectWorkspaceCandidates(env: Environment): WorkspaceValue[] {
  const candidates: WorkspaceValue[] = [];
  const activeWorkspace = env.getActiveWorkspace();
  if (activeWorkspace) {
    candidates.push(activeWorkspace);
  }

  const allVariables = env.getAllVariables();
  for (const variable of allVariables.values()) {
    const candidate = (variable as { value?: unknown }).value;
    if (isWorkspaceValue(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

async function resolveWorkspaceFileDiff(filePath: string, env: Environment): Promise<string | undefined> {
  const seen = new Set<WorkspaceValue>();
  for (const workspace of collectWorkspaceCandidates(env)) {
    if (seen.has(workspace)) {
      continue;
    }
    seen.add(workspace);
    try {
      return await workspace.fs.fileDiff(filePath);
    } catch (error) {
      if (isIgnorableWorkspaceDiffError(error)) {
        continue;
      }
      throw error;
    }
  }
  return undefined;
}

function hasCapturedModuleEnv(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return 'capturedModuleEnv' in (value as Record<string, unknown>);
}

function isSerializedExecutableWithInternal(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const raw = value as Record<string, unknown>;
  return raw.__executable === true && Boolean(raw.internal && typeof raw.internal === 'object');
}

function getNamespaceExportKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter(key => {
    if (key === '__metadata__') {
      return false;
    }
    if (isNamespaceInternalField(key)) {
      return false;
    }
    return true;
  });
}

function getNamespaceImportSource(variable: Variable): string | undefined {
  if (variable.definedAt?.filePath && variable.definedAt.filePath.length > 0) {
    return variable.definedAt.filePath;
  }
  const internalPath = variable.internal?.importPath;
  return typeof internalPath === 'string' && internalPath.length > 0 ? internalPath : undefined;
}

/**
 * Result of field access that preserves context
 */
export interface FieldAccessResult {
  /** The accessed value */
  value: any;
  /** The parent Variable if available */
  parentVariable?: Variable;
  /** The access path taken */
  accessPath: string[];
  /** Whether the value itself is a Variable */
  isVariable: boolean;
}

/**
 * Options for field access
 */
export interface FieldAccessOptions {
  /** Whether to preserve context and return FieldAccessResult */
  preserveContext?: boolean;
  /** Parent path for building access path */
  parentPath?: string[];
  /** Base identifier for source-aware diagnostics */
  baseIdentifier?: string;
  /** Whether to return undefined for missing fields instead of null */
  returnUndefinedForMissing?: boolean;
  /** Environment for async operations like filters */
  env?: Environment;
  /** Optional source location for better error reporting */
  sourceLocation?: SourceLocation;
}

/**
 * Access a field on an object or array.
 * Handles dot notation (object.field), numeric fields (obj.123), 
 * array indexing (array[0]), string indexing (obj["key"]),
 * array slicing (array[0:5]), and array filtering (array[?field>100])
 * 
 * Phase 2: Handle normalized AST objects
 * Phase 5: Consolidated with enhanced field access for Variable preservation
 * Phase 6: Added array operations (slice and filter)
 */
export async function accessField(value: any, field: FieldAccessNode, options?: FieldAccessOptions): Promise<any | FieldAccessResult> {
  // Check if the input is a Variable
  const parentVariable = isVariable(value) ? value : (value as any)?.__variable;
  const strictMissingFieldAccess = Boolean(
    isVariable(value) &&
      value.internal &&
      (value.internal as Record<string, unknown>).strictFieldAccess === true
  );

  // Extract the raw value if we have a Variable (do this BEFORE metadata check)
  let rawValue = isVariable(value) ? value.value : value;

  const slotRefValue = isShelfSlotRefValue(rawValue) ? rawValue : undefined;
  const structuredWrapper = slotRefValue
    ? (isStructuredValue(slotRefValue.current) ? slotRefValue.current : undefined)
    : (isStructuredValue(rawValue) ? rawValue : undefined);
  const structuredCtx = (structuredWrapper?.mx ?? undefined) as Record<string, unknown> | undefined;
  if (structuredWrapper) {
    rawValue = structuredWrapper.data;
  } else if (slotRefValue) {
    rawValue = slotRefValue.data;
  }

  const fieldValue = field.value;
  const fieldName = String(fieldValue);
  const missingValue = options?.returnUndefinedForMissing ? undefined : null;
  const guardArgsMode =
    field.type === 'field'
      ? 'field'
      : field.type === 'stringIndex' || field.type === 'bracketAccess'
        ? 'bracket'
        : null;

  if (guardArgsMode && isGuardArgsView(rawValue)) {
    const resolved = resolveGuardArgsViewProperty(rawValue, fieldName, guardArgsMode);
    if (resolved.found) {
      if (options?.preserveContext) {
        return {
          value: resolved.value,
          parentVariable,
          accessPath: [...(options.parentPath || []), fieldName],
          isVariable: isVariable(resolved.value)
        };
      }
      return resolved.value;
    }
  }

  // Special handling for Variable metadata properties
  // IMPORTANT: Check metadata for core properties (.type, .mx, etc.),
  // but allow data precedence for guard quantifiers (.all, .any, .none)
  if (isVariable(value) && field.type === 'field') {
    const fieldName = String(field.value);
    const isStructuredVariable = Boolean(structuredWrapper);
    const isUserDataContainer = value.type === 'object' || value.type === 'array';
    const structuredFieldFallbacks = new Set(['type', 'text', 'data']);
    const shouldUseStructuredTopLevelFallback =
      isStructuredVariable &&
      structuredFieldFallbacks.has(fieldName) &&
      (slotRefValue !== undefined || !(rawValue && typeof rawValue === 'object'));

    // Core metadata properties always come from Variable, never from data
    const CORE_METADATA = [
      'isComplex',
      'internal',
      'mx',
      'raw',
      ...(!isStructuredVariable && !isUserDataContainer ? ['source', 'metadata'] : [])
    ];

    if (CORE_METADATA.includes(fieldName)) {
      if (
        fieldName === 'internal' &&
        value.type === 'executable' &&
        value.mx?.isImported === true &&
        hasCapturedModuleEnv(value.internal)
      ) {
        const accessPath = [...(options?.parentPath || []), fieldName];
        throw new FieldAccessError(`Field "${fieldName}" not found in object`, {
          baseValue: {
            type: value.type,
            name: value.name
          },
          fieldAccessChain: [],
          failedAtIndex: Math.max(0, accessPath.length - 1),
          failedKey: fieldName,
          accessPath,
          availableKeys: Object.keys(value as unknown as Record<string, unknown>).filter(key => key !== 'internal')
        }, {
          sourceLocation: options?.sourceLocation,
          env: options?.env
        });
      }

      const metadataValue = (() => {
        if (fieldName !== 'mx') {
          return value[fieldName as keyof typeof value];
        }

        const baseMx =
          structuredCtx ??
          (isLoadContentResult(rawValue) ? (rawValue as any).mx : undefined) ??
          (value as any).mx;

        return createObjectUtilityMxView(baseMx, rawValue, structuredWrapper, value, options?.env);
      })();

      if (options?.preserveContext) {
        return {
          value: metadataValue,
          parentVariable: value,
          accessPath: [...(options.parentPath || []), fieldName],
          isVariable: false
        };
      }
      return metadataValue;
    }

    // Properties that check data first, then fall back to Variable metadata
    // For 'type': only check data first for user data containers (object/array),
    // since other Variable types (executable, string, etc.) have internal 'type' fields
    const GUARD_QUANTIFIERS = ['all', 'any', 'none'];
    // For 'type' on non-user-data containers, ALWAYS return Variable.type
    // (executables, strings, etc. have internal 'type' fields that shouldn't be exposed)
    if (fieldName === 'type' && !isUserDataContainer && !isStructuredVariable) {
      const metadataValue = value.type;
      if (options?.preserveContext) {
        return {
          value: metadataValue,
          parentVariable: value,
          accessPath: [...(options.parentPath || []), fieldName],
          isVariable: false
        };
      }
      return metadataValue;
    }

    // For guard quantifiers and 'type' on user data containers, check data first
    const shouldCheckDataFirst =
      GUARD_QUANTIFIERS.includes(fieldName) ||
      fieldName === 'type' ||
      shouldUseStructuredTopLevelFallback;

    if (shouldCheckDataFirst) {
      // Check if this field exists in the actual data first
      const fieldExistsInData = rawValue && typeof rawValue === 'object' && fieldName in rawValue;

      if (!fieldExistsInData) {
        if (shouldUseStructuredTopLevelFallback) {
          const metadataValue =
            fieldName === 'type'
              ? structuredWrapper.type
              : fieldName === 'text'
                ? structuredWrapper.text
                : structuredWrapper.data;

          if (options?.preserveContext) {
            return {
              value: metadataValue,
              parentVariable: value,
              accessPath: [...(options.parentPath || []), fieldName],
              isVariable: false
            };
          }
          return metadataValue;
        } else {
        // Field doesn't exist in data, so return metadata property
          const metadataValue = value[fieldName as keyof typeof value];

          if (options?.preserveContext) {
            return {
              value: metadataValue,
              parentVariable: value,
              accessPath: [...(options.parentPath || []), fieldName],
              isVariable: false
            };
          }
          return metadataValue;
        }
      }
    }
  }
  // Perform the actual field access
  let accessedValue: any;
  
  switch (field.type) {
    case 'field':
    case 'stringIndex':
    case 'bracketAccess': {
      // All handle string-based property access
      const name = String(fieldValue);
      if (structuredWrapper) {
        if (name === 'keepStructured') {
          if (structuredWrapper.internal) {
            (structuredWrapper.internal as Record<string, unknown>).keepStructured = true;
          } else {
            (structuredWrapper as Record<string, unknown>).internal = { keepStructured: true };
          }
          accessedValue = structuredWrapper;
          break;
        }
        if (name === 'keep') {
          if (structuredWrapper.internal) {
            (structuredWrapper.internal as Record<string, unknown>).keepStructured = true;
          } else {
            (structuredWrapper as Record<string, unknown>).internal = { keepStructured: true };
          }
          accessedValue = structuredWrapper;
          break;
        }
        if (name === 'mx') {
          accessedValue = createObjectUtilityMxView(
            structuredWrapper.mx,
            rawValue,
            structuredWrapper,
            parentVariable,
            options?.env
          );
          break;
        }
      }
      if (
        !structuredWrapper &&
        name === 'mx' &&
        rawValue &&
        typeof rawValue === 'object' &&
        !('mx' in (rawValue as Record<string, unknown>))
      ) {
        const descriptor = extractSecurityDescriptor(rawValue) ?? extractSecurityDescriptor(value);
        const syntheticMx = descriptor ? {} : undefined;
        if (syntheticMx) {
          updateVarMxFromDescriptor(syntheticMx as any, descriptor);
        }
        accessedValue = createObjectUtilityMxView(syntheticMx, rawValue, undefined, parentVariable, options?.env);
        break;
      }
      if (typeof rawValue === 'string') {
        // Support .length on strings (like JavaScript)
        if (name === 'length') {
          accessedValue = rawValue.length;
          break;
        }

        // Check if this looks like a JSON string - provide helpful error
        const trimmed = rawValue.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          const chain = [...(options?.parentPath || []), name];
          throw new FieldAccessError(
            `Cannot access field "${name}" on JSON string. Parse with \`| @parse\` first, or use \`.mx.text\` / \`.mx.data\` wrapper accessors.`,
            {
              baseValue: rawValue,
              fieldAccessChain: [],
              failedAtIndex: Math.max(0, chain.length - 1),
              failedKey: name,
              isJsonString: true
            },
            { sourceLocation: options?.sourceLocation, env: options?.env }
          );
        }
      }

      if (typeof rawValue !== 'object' || rawValue === null) {
        if (rawValue === null || rawValue === undefined) {
          accessedValue = missingValue;
          break;
        }
        const chain = [...(options?.parentPath || []), name];
        const extensionHint = getCommonExtensionFieldAccessHint(name, options);
        const msg = extensionHint
          ? `Cannot access field "${name}" on non-object value (${typeof rawValue}). ${extensionHint}`
          : `Cannot access field "${name}" on non-object value (${typeof rawValue})`;
        throw new FieldAccessError(msg, {
          baseValue: rawValue,
          fieldAccessChain: [],
          failedAtIndex: Math.max(0, chain.length - 1),
          failedKey: name
        }, { sourceLocation: options?.sourceLocation, env: options?.env });
      }

      if (isWorkspaceValue(rawValue)) {
        if (name === 'edits') {
          const changes = await rawValue.fs.changes();
          accessedValue = normalizeWorkspaceChangesForDisplay(changes, options?.env);
          break;
        }
        if (name === 'diff') {
          const changes = await rawValue.fs.diff();
          accessedValue = normalizeWorkspaceChangesForDisplay(changes, options?.env);
          break;
        }
      }

      const workspaceMxContext = getWorkspaceMxContext(rawValue);
      if (workspaceMxContext) {
        if (name === 'edits' && workspaceMxContext.workspace) {
          const changes = await workspaceMxContext.workspace.fs.changes();
          accessedValue = normalizeWorkspaceChangesForDisplay(changes, options?.env);
          break;
        }
        if (name === 'diff') {
          if (workspaceMxContext.workspace) {
            const changes = await workspaceMxContext.workspace.fs.diff();
            accessedValue = normalizeWorkspaceChangesForDisplay(changes, options?.env);
            break;
          }
          if (workspaceMxContext.path && options?.env) {
            const diff = await resolveWorkspaceFileDiff(workspaceMxContext.path, options.env);
            if (diff !== undefined) {
              accessedValue = diff;
              break;
            }
          }
        }
      }
      
      // Handle LoadContentResult objects - access metadata properties
      if (isLoadContentResult(rawValue)) {
        // For JSON files, check if property exists on parsed JSON first
        // This handles .length on arrays correctly (returns element count, not string length)
        if (rawValue.json !== undefined) {
          const jsonData = rawValue.json;
          if (jsonData && typeof jsonData === 'object') {
            // For arrays, handle .length specially
            if (Array.isArray(jsonData) && name === 'length') {
              accessedValue = jsonData.length;
              break;
            }
            // Check for property on the JSON object
            if (name in jsonData) {
              accessedValue = jsonData[name];
              break;
            }
          }
        }

        // Then check if it's a metadata property that exists directly on LoadContentResult
        if (name in rawValue) {
          const result = (rawValue as any)[name];
          if (result !== undefined) {
            accessedValue = result;
            break;
          }
        }

        accessedValue = missingValue;
        break;
      }
      
      // Handle Variable objects with type 'object' and value field
      if (rawValue.type === 'object' && rawValue.value && !isObjectAST(rawValue)) {
        // This is a Variable object, access fields in the value
        const actualValue = rawValue.value;
        if (!(name in actualValue)) {
          accessedValue = missingValue;
          break;
        }
        accessedValue = actualValue[name];
        break;
      }

      // Handle normalized AST objects (with entries or properties)
      if (isObjectAST(rawValue)) {
        // Access the field using helper that handles both formats
        if (hasObjectField(rawValue, name)) {
          accessedValue = getObjectField(rawValue, name);
          if (options?.env) {
            accessedValue = await resolveDeferredObjectFieldValue(
              accessedValue,
              options.env,
              options?.sourceLocation
            );
          }
          break;
        }

        if (options?.env) {
          const evaluatedObject = await resolveDeferredObjectFieldValue(
            rawValue,
            options.env,
            options?.sourceLocation
          );
          if (
            evaluatedObject &&
            typeof evaluatedObject === 'object' &&
            !Array.isArray(evaluatedObject) &&
            name in (evaluatedObject as Record<string, unknown>)
          ) {
            accessedValue = (evaluatedObject as Record<string, unknown>)[name];
            break;
          }
        }

        accessedValue = missingValue;
        break;
      }

      // Handle normalized AST arrays with direct length access
      if (rawValue && typeof rawValue === 'object' && rawValue.type === 'array' && Array.isArray(rawValue.items)) {
        if (name === 'length') {
          accessedValue = rawValue.items.length;
          break;
        }
      }

      // Handle plain arrays - check .length before falling through to generic object access
      if (Array.isArray(rawValue) && name === 'length') {
        accessedValue = rawValue.length;
        break;
      }

      // Handle regular objects (including Variables with type: 'object')
      if (name === 'internal' && isSerializedExecutableWithInternal(rawValue)) {
        const baseValue = Object.fromEntries(
          Object.entries(rawValue as Record<string, unknown>).filter(([key]) => key !== 'internal')
        );
        const accessPath = [...(options?.parentPath || []), name];
        throw new FieldAccessError(`Field "${name}" not found in object`, {
          baseValue,
          fieldAccessChain: [],
          failedAtIndex: Math.max(0, accessPath.length - 1),
          failedKey: name,
          accessPath,
          availableKeys: Object.keys(rawValue as Record<string, unknown>).filter(key => key !== 'internal')
        }, {
          sourceLocation: options?.sourceLocation,
          env: options?.env
        });
      }

      if (!(name in rawValue)) {
        if (isVariable(value) && value.name === 'mx' && name === 'guard') {
          const accessPath = [...(options?.parentPath || []), name];
          throw new FieldAccessError('Variable "mx" has no field "guard"', {
            baseValue: rawValue,
            fieldAccessChain: [],
            failedAtIndex: Math.max(0, accessPath.length - 1),
            failedKey: name,
            accessPath,
            availableKeys: Object.keys(rawValue)
          }, {
            sourceLocation: options?.sourceLocation,
            env: options?.env
          });
        }
        if (strictMissingFieldAccess) {
          const accessPath = [...(options?.parentPath || []), name];
          const namespaceVariable = isVariable(value) && value.internal?.isNamespace === true
            ? value
            : undefined;
          if (
            namespaceVariable &&
            rawValue &&
            typeof rawValue === 'object' &&
            !Array.isArray(rawValue)
          ) {
            const namespaceName = `@${namespaceVariable.name}`;
            const availableKeys = getNamespaceExportKeys(rawValue as Record<string, unknown>);
            const availableSummary = availableKeys.length > 0 ? availableKeys.join(', ') : '(none)';
            const importSource = getNamespaceImportSource(namespaceVariable);
            const importSuffix = importSource ? ` Imported from ${importSource}.` : '';
            throw new FieldAccessError(
              `Namespace ${namespaceName} does not export "${name}". Available exports: ${availableSummary}.${importSuffix}`,
              {
                baseValue: namespaceName,
                fieldAccessChain: [],
                failedAtIndex: Math.max(0, accessPath.length - 1),
                failedKey: name,
                accessPath,
                availableKeys
              },
              {
                sourceLocation: options?.sourceLocation,
                env: options?.env
              }
            );
          }

          const extensionHint = getCommonExtensionFieldAccessHint(name, options);
          const message = extensionHint
            ? `Field "${name}" not found in object. ${extensionHint}`
            : `Field "${name}" not found in object`;
          throw new FieldAccessError(message, {
            baseValue: rawValue,
            fieldAccessChain: [],
            failedAtIndex: Math.max(0, accessPath.length - 1),
            failedKey: name,
            accessPath,
            availableKeys: Object.keys(rawValue)
          }, {
            sourceLocation: options?.sourceLocation,
            env: options?.env
          });
        }
        accessedValue = missingValue;
        break;
      }

      accessedValue = rawValue[name];
      break;
    }

    case 'numericField': {
      // Handle numeric property access (obj.123)
      const numKey = String(fieldValue);
      const index = Number(fieldValue);
      
      if (rawValue === null || rawValue === undefined) {
        accessedValue = missingValue;
        break;
      }

      if (typeof rawValue !== 'object') {
        const chain = [...(options?.parentPath || []), numKey];
        throw new FieldAccessError(`Cannot access numeric field "${numKey}" on non-object value`, {
          baseValue: rawValue,
          fieldAccessChain: [],
          failedAtIndex: Math.max(0, chain.length - 1),
          failedKey: numKey,
          accessPath: chain
        });
      }
      
      // Deprecation warning: dot-notation numeric access on arrays (e.g., arr.1)
      // Recommend bracket access instead (arr[1])
      // Historically this path emitted a deprecation warning for array access
      // like obj.0. Property style access is now supported, so we skip the warning.

      // Handle normalized AST arrays with numeric property access (arr.0)
      if (rawValue && typeof rawValue === 'object' && rawValue.type === 'array' && rawValue.items) {
        const items = rawValue.items;
        if (index < 0 || index >= items.length) {
          accessedValue = missingValue;
          break;
        }
        accessedValue = items[index];
        if (options?.env) {
          accessedValue = await resolveDeferredObjectFieldValue(
            accessedValue,
            options.env,
            options?.sourceLocation
          );
        }
        break;
      }

      // Handle normalized AST objects (with entries or properties)
      if (isObjectAST(rawValue)) {
        if (!hasObjectField(rawValue, numKey)) {
          accessedValue = missingValue;
          break;
        }
        accessedValue = getObjectField(rawValue, numKey);
        break;
      }
      
      // Handle regular objects
      if (!(numKey in rawValue)) {
        accessedValue = missingValue;
        break;
      }
      
      accessedValue = rawValue[numKey];
      break;
    }
    
    case 'arrayIndex': {
      // Handle array index access (arr[0])
      const index = Number(fieldValue);

      if (rawValue === null || rawValue === undefined) {
        accessedValue = missingValue;
        break;
      }
      
      // Handle normalized AST arrays
      if (rawValue && typeof rawValue === 'object' && rawValue.type === 'array' && rawValue.items) {
        const items = rawValue.items;
        if (index < 0 || index >= items.length) {
          accessedValue = missingValue;
          break;
        }
        accessedValue = items[index];
        if (options?.env) {
          accessedValue = await resolveDeferredObjectFieldValue(
            accessedValue,
            options.env,
            options?.sourceLocation
          );
        }
        break;
      }
      
      // Handle regular arrays
      // CRITICAL: rawValue might itself be a StructuredValue (nested wrapping)
      // We need to unwrap it before array operations
      const arrayData = isStructuredValue(rawValue) ? asData(rawValue) : rawValue;

      if (!Array.isArray(arrayData)) {
        // Try object access with numeric key as fallback
        const numKey = String(fieldValue);
        if (typeof arrayData === 'object' && arrayData !== null) {
          // Handle normalized AST objects (with entries or properties)
          if (isObjectAST(arrayData)) {
            if (hasObjectField(arrayData, numKey)) {
              accessedValue = getObjectField(arrayData, numKey);
              break;
            }
          } else if (numKey in arrayData) {
            accessedValue = arrayData[numKey];
            break;
          }
        }
        {
          const chain = [...(options?.parentPath || []), String(index)];
          const msg = `Cannot access index ${index} on non-array value (${typeof arrayData})`;
          throw new FieldAccessError(msg, {
            baseValue: arrayData,
            fieldAccessChain: [],
            failedAtIndex: Math.max(0, chain.length - 1),
            failedKey: index
          });
        }
      }

      if (index < 0 || index >= arrayData.length) {
        accessedValue = missingValue;
        break;
      }

      accessedValue = arrayData[index];
      break;
    }
    
    case 'arraySlice':
    case 'arrayFilter': {
      // Handle array operations (slice and filter)
      const arrayOps = new ArrayOperationsHandler();
      
      // Use the full value (including Variable wrapper if present) for array operations
      // This allows the handler to properly extract and preserve metadata
      const env = options?.env;
      if (!env && field.type === 'arrayFilter') {
        throw new FieldAccessError('Environment required for array filter operations', {
          baseValue: value,
          fieldAccessChain: options?.parentPath || [],
          failedAtIndex: options?.parentPath ? options.parentPath.length : 0,
          failedKey: 'arrayFilter'
        });
      }
      
      accessedValue = await arrayOps.handle(value, field, env!);
      break;
    }

    case 'variableIndex': {
      const env = options?.env;
      if (!env) {
        throw new FieldAccessError('Environment required for variable index resolution', {
          baseValue: value,
          fieldAccessChain: options?.parentPath || [],
          failedAtIndex: options?.parentPath ? options.parentPath.length : 0,
          failedKey: field.value
        });
      }

      const { evaluateDataValue } = await import('../eval/data-value-evaluator');
      // Build a VariableReference node when only an identifier string is provided
      const indexNode =
        typeof field.value === 'object'
          ? (field.value as any)
          : {
              type: 'VariableReference',
              valueType: 'varIdentifier',
              identifier: String(field.value)
            };

      const indexValue = await evaluateDataValue(indexNode as any, env);
      const resolvedField = { type: 'bracketAccess' as const, value: indexValue };
      return accessField(value, resolvedField, options);
    }
    
    default:
      throw new FieldAccessError(`Unknown field access type: ${(field as any).type}`, {
        baseValue: value,
        fieldAccessChain: options?.parentPath || [],
        failedAtIndex: options?.parentPath ? options.parentPath.length : 0,
        failedKey: String((field as any).type || 'unknown')
      });
  }

  const isMxHandleAccessor = Boolean(
    value &&
      typeof value === 'object' &&
      (value as Record<PropertyKey, unknown>)[OBJECT_UTILITY_MX_VIEW] === true &&
      (fieldName === 'handle' || fieldName === 'handles')
  );

  if (!isMxHandleAccessor) {
    const provenanceSource = parentVariable ?? structuredWrapper ?? value;
    const provenanceDescriptor = (() => {
      if (!provenanceSource) {
        return undefined;
      }
      const descriptor = extractSecurityDescriptor(provenanceSource);
      return isStructuredValue(accessedValue)
        ? stripFactLabelsFromDescriptor(descriptor)
        : descriptor;
    })();
    const currentDescriptor = isStructuredValue(accessedValue)
      ? extractSecurityDescriptor(accessedValue)
      : undefined;
    const fieldMetadata = getFieldMetadata(parentVariable, structuredWrapper, fieldName);
    const fieldDescriptor = fieldMetadata?.descriptor;
    const effectiveDescriptor =
      provenanceDescriptor && currentDescriptor && fieldDescriptor
        ? mergeDescriptors(provenanceDescriptor, currentDescriptor, fieldDescriptor)
        : provenanceDescriptor && currentDescriptor
          ? mergeDescriptors(provenanceDescriptor, currentDescriptor)
          : provenanceDescriptor && fieldDescriptor
            ? mergeDescriptors(provenanceDescriptor, fieldDescriptor)
            : currentDescriptor && fieldDescriptor
              ? mergeDescriptors(currentDescriptor, fieldDescriptor)
              : fieldDescriptor ?? currentDescriptor ?? provenanceDescriptor;

    if (effectiveDescriptor && ((effectiveDescriptor.labels?.length ?? 0) > 0 || (effectiveDescriptor.taint?.length ?? 0) > 0)) {
      if (accessedValue != null && typeof accessedValue !== 'object') {
        // Primitive values can't be keyed in WeakMap, so wrap in StructuredValue to carry security labels.
        accessedValue = wrapExecResult(accessedValue);
        applySecurityDescriptorToStructuredValue(accessedValue, effectiveDescriptor);
      } else if (isStructuredValue(accessedValue)) {
        applySecurityDescriptorToStructuredValue(accessedValue, effectiveDescriptor);
      } else {
        setExpressionProvenance(accessedValue, effectiveDescriptor);
      }
    } else if (provenanceSource) {
      inheritExpressionProvenance(accessedValue, provenanceSource);
    }

    if (fieldMetadata?.factsources && fieldMetadata.factsources.length > 0) {
      if (accessedValue != null && typeof accessedValue !== 'object') {
        accessedValue = wrapExecResult(accessedValue);
      }
      if (isStructuredValue(accessedValue)) {
        accessedValue.metadata = {
          ...(accessedValue.metadata ?? {}),
          factsources: [...fieldMetadata.factsources]
        };
        accessedValue.mx.factsources = [...fieldMetadata.factsources];
      }
    }

    if (fieldMetadata?.projection) {
      if (accessedValue != null && typeof accessedValue !== 'object') {
        accessedValue = wrapExecResult(accessedValue);
      }
      if (isStructuredValue(accessedValue)) {
        setRecordProjectionMetadata(accessedValue, fieldMetadata.projection as any);
      }
    }
  }

  // Check if we need to return context-preserving result
  if (options?.preserveContext) {
    const accessPath = [...(options.parentPath || []), fieldName];
    const resultIsVariable = isVariable(accessedValue);

    return {
      value: accessedValue,
      parentVariable,
      accessPath,
      isVariable: resultIsVariable
    };
  }

  // Return raw value for backward compatibility
  return accessedValue;
}

/**
 * Access multiple fields in sequence, preserving context
 */
export async function accessFields(
  value: any,
  fields: FieldAccessNode[],
  options?: FieldAccessOptions
): Promise<any | FieldAccessResult> {
  let current = value;
  let path = options?.parentPath || [];
  let parentVar = isVariable(value) ? value : undefined;
  
  const shouldPreserveContext = options?.preserveContext !== false;
  
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];

    // Wildcard index: project remaining fields over each array element
    if (field.type === 'wildcardIndex') {
      let unwrapped = isVariable(current) ? current.value : current;
      unwrapped = isStructuredValue(unwrapped) ? asData(unwrapped) : unwrapped;
      // Handle AST array nodes ({type: 'array', items: [...]})
      const arrayData = (unwrapped && typeof unwrapped === 'object' && unwrapped.type === 'array' && unwrapped.items)
        ? unwrapped.items
        : unwrapped;
      if (!Array.isArray(arrayData)) {
        throw new FieldAccessError('Cannot use [*] on non-array value', {
          baseValue: current,
          fieldAccessChain: path,
          failedAtIndex: path.length,
          failedKey: '*'
        });
      }
      const remaining = fields.slice(i + 1);
      if (remaining.length === 0) {
        // [*] with no trailing fields returns the array as-is
        break;
      }
      const projected = await Promise.all(
        arrayData.map(element =>
          accessFields(element, remaining, {
            ...options,
            preserveContext: false,
            parentPath: [...path, '*']
          })
        )
      );
      current = projected;
      break;
    }

    const result = await accessField(current, field, {
      preserveContext: shouldPreserveContext,
      parentPath: path,
      returnUndefinedForMissing: options?.returnUndefinedForMissing,
      env: options?.env,
      sourceLocation: options?.sourceLocation
    });

    if (shouldPreserveContext) {
      // Update tracking variables
      current = (result as FieldAccessResult).value;
      path = (result as FieldAccessResult).accessPath;

      // Update parent variable if we accessed through a Variable
      if ((result as FieldAccessResult).isVariable && isVariable((result as FieldAccessResult).value)) {
        parentVar = (result as FieldAccessResult).value;
      }
      if (current === null || current === undefined) {
        break;
      }
    } else {
      // Simple mode - just get the value
      current = result;
      if (current === null || current === undefined) {
        break;
      }
    }
  }
  
  if (shouldPreserveContext) {
    return {
      value: current,
      parentVariable: parentVar,
      accessPath: path,
      isVariable: isVariable(current)
    };
  }

  return current;
}

/**
 * Create a Variable wrapper for field access results when needed
 */
export function createFieldAccessVariable(
  result: FieldAccessResult,
  source: any
): Variable {
  // If the result is already a Variable, return it
  if (result.isVariable && isVariable(result.value)) {
    return result.value;
  }
  const sourceVariable = isVariable(source) ? source : undefined;
  const variableSource =
    sourceVariable?.source ??
    (isVariable(result.parentVariable) ? result.parentVariable.source : undefined) ??
    source;
  const internalSource = sourceVariable ?? result.parentVariable;
  const now = Date.now();
  // Create a computed Variable to preserve context
  return {
    type: 'computed',
    name: result.accessPath.join('.'),
    value: result.value,
    source: variableSource,
    createdAt: now,
    modifiedAt: now,
    internal: {
      source: internalSource,
      parentVariable: result.parentVariable,
      accessPath: result.accessPath,
      fieldAccess: true
    }
  } as Variable;
}
