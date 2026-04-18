import { isShelfSlotRefValue } from '@core/types/shelf';
import { getToolCollectionMetadata } from '@core/types/tools';
import {
  ENVIRONMENT_SERIALIZE_PLACEHOLDER,
  isEnvironmentTagged
} from '@core/utils/environment-identity';

export type OpaqueRuntimeValueKind =
  | 'environment'
  | 'shelf-slot-ref'
  | 'executable-reference'
  | 'executable-variable'
  | 'imported-executable'
  | 'executable-definition';

const EXECUTABLE_DEFINITION_TYPES = new Set([
  'command',
  'commandRef',
  'code',
  'template',
  'resolver',
  'pipeline',
  'data',
  'prose',
  'nodeFunction',
  'nodeClass',
  'partial'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function getOwnDataProperty(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !('value' in descriptor)) {
    return undefined;
  }
  return descriptor.value;
}

function getOwnStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = getOwnDataProperty(record, key);
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function isToolCollectionLike(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  if (getToolCollectionMetadata(value)) {
    return true;
  }

  const internal = getOwnDataProperty(value, 'internal');
  return Boolean(
    isRecord(internal) &&
    (
      getOwnDataProperty(internal, 'isToolsCollection') === true ||
      isRecord(getOwnDataProperty(internal, 'toolCollection'))
    )
  );
}

function isExecutableDefinitionLike(record: Record<string, unknown>): boolean {
  const type = getOwnDataProperty(record, 'type');
  if (typeof type !== 'string' || !EXECUTABLE_DEFINITION_TYPES.has(type)) {
    return false;
  }

  if (typeof getOwnDataProperty(record, 'sourceDirective') === 'string') {
    return true;
  }

  return (
    hasOwn(record, 'commandTemplate') ||
    hasOwn(record, 'codeTemplate') ||
    hasOwn(record, 'template') ||
    hasOwn(record, 'pipeline') ||
    hasOwn(record, 'dataTemplate') ||
    hasOwn(record, 'configRef')
  );
}

function isExecutableVariableLike(record: Record<string, unknown>): boolean {
  return getOwnDataProperty(record, 'type') === 'executable' && hasOwn(record, 'value');
}

function isExecutableReferenceLike(record: Record<string, unknown>): boolean {
  return getOwnDataProperty(record, '__executable') === true;
}

function isImportedExecutableLike(record: Record<string, unknown>): boolean {
  if (getOwnDataProperty(record, 'type') !== 'imported') {
    return false;
  }

  const value = getOwnDataProperty(record, 'value');
  if (isRecord(value) && (isExecutableDefinitionLike(value) || isExecutableReferenceLike(value))) {
    return true;
  }

  const internal = getOwnDataProperty(record, 'internal');
  return Boolean(
    isRecord(internal) &&
    (
      hasOwn(internal, 'executableDef') ||
      hasOwn(internal, 'capturedModuleEnv')
    )
  );
}

function getExecutableParamNames(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }

  const directParams = getOwnStringArray(value, 'paramNames');
  if (directParams) {
    return directParams;
  }

  const innerValue = getOwnDataProperty(value, 'value');
  if (isRecord(innerValue)) {
    return getOwnStringArray(innerValue, 'paramNames') ?? [];
  }

  const internal = getOwnDataProperty(value, 'internal');
  if (isRecord(internal)) {
    const executableDef = getOwnDataProperty(internal, 'executableDef');
    if (isRecord(executableDef)) {
      return getOwnStringArray(executableDef, 'paramNames') ?? [];
    }
  }

  return [];
}

function summarizeFunctionLike(value: unknown): string {
  const params = getExecutableParamNames(value);
  return `<function(${params.join(', ')})>`;
}

export function getOpaqueRuntimeValueKind(value: unknown): OpaqueRuntimeValueKind | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (isEnvironmentTagged(value)) {
    return 'environment';
  }

  if (isShelfSlotRefValue(value)) {
    return 'shelf-slot-ref';
  }

  if (isExecutableReferenceLike(value)) {
    return 'executable-reference';
  }

  if (isExecutableVariableLike(value)) {
    return 'executable-variable';
  }

  if (isImportedExecutableLike(value)) {
    return 'imported-executable';
  }

  if (isExecutableDefinitionLike(value)) {
    return 'executable-definition';
  }

  if (isToolCollectionLike(value)) {
    return undefined;
  }

  return undefined;
}

export function isOpaqueRuntimeValue(value: unknown): boolean {
  return getOpaqueRuntimeValueKind(value) !== undefined;
}

export function summarizeOpaqueRuntimeValue(value: unknown): string | undefined {
  const kind = getOpaqueRuntimeValueKind(value);
  if (!kind) {
    return undefined;
  }

  switch (kind) {
    case 'environment':
      return ENVIRONMENT_SERIALIZE_PLACEHOLDER;
    case 'shelf-slot-ref':
      return isShelfSlotRefValue(value)
        ? `[shelf-slot-ref: ${value.shelfName}.${value.slotName}]`
        : '[shelf-slot-ref]';
    case 'executable-reference':
    case 'executable-variable':
    case 'imported-executable':
    case 'executable-definition':
      return summarizeFunctionLike(value);
  }
}
