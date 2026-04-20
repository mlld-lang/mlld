import {
  astLocationToSourceLocation,
  type SourceLocation
} from '@core/types';
import {
  canUseRecordForSessionSlot,
  type RecordDefinition
} from '@core/types/record';
import type {
  SessionDefinition,
  SessionPrimitiveType,
  SessionSlotBinding,
  SessionSlotType
} from '@core/types/session';
import { getStaticObjectKey } from '@interpreter/utils/object-compat';
import type { StaticValidationIssue } from './issues';

type SessionTypeNode = {
  type?: string;
  base?: {
    kind?: 'primitive' | 'record';
    name?: string;
  };
  isArray?: boolean;
  optional?: boolean;
};

type SessionSchemaEntryNode = {
  type?: string;
  key?: unknown;
  value?: unknown;
  location?: {
    start?: unknown;
    end?: unknown;
  };
};

type SessionSchemaObjectNode = {
  entries?: SessionSchemaEntryNode[];
};

export interface SessionDefinitionBuildResult {
  definition?: SessionDefinition;
  issues: StaticValidationIssue[];
}

export interface BuildSessionDefinitionOptions {
  filePath?: string;
  isToolsCollection?: boolean;
  resolveRecord?: (name: string) => RecordDefinition | undefined;
  securityLabels?: readonly string[];
}

function issue(
  code: string,
  message: string,
  location?: SourceLocation
): StaticValidationIssue {
  return { code, message, location };
}

function createSessionDeclarationId(identifier: string, location?: SourceLocation): string {
  const sourcePath =
    typeof location?.filePath === 'string' && location.filePath.trim().length > 0
      ? location.filePath.trim()
      : '<anonymous>';
  return `${sourcePath}#${identifier}`;
}

function toLocation(
  location: { start?: unknown; end?: unknown } | undefined,
  filePath?: string,
  fallback?: SourceLocation
): SourceLocation | undefined {
  return astLocationToSourceLocation(location as any, filePath) ?? fallback;
}

function readSessionKey(key: unknown): string | undefined {
  if (typeof key === 'string' && key.trim().length > 0) {
    return key.trim();
  }

  const staticKey = getStaticObjectKey(key);
  if (typeof staticKey === 'string' && staticKey.trim().length > 0) {
    return staticKey.trim();
  }

  return undefined;
}

function isSessionPrimitiveType(value: unknown): value is SessionPrimitiveType {
  return value === 'string'
    || value === 'number'
    || value === 'boolean'
    || value === 'object'
    || value === 'array';
}

function normalizeSessionSlotType(args: {
  slotName: string;
  node: unknown;
  sourceLocation?: SourceLocation;
  resolveRecord?: (name: string) => RecordDefinition | undefined;
}): SessionDefinitionBuildResult & { type?: SessionSlotType } {
  const {
    node,
    resolveRecord,
    slotName,
    sourceLocation
  } = args;
  const issues: StaticValidationIssue[] = [];
  const candidate = node as SessionTypeNode | undefined;

  if (candidate?.type !== 'sessionType') {
    issues.push(issue(
      'INVALID_SESSION_SLOT_TYPE',
      `Session slot '${slotName}' must use a type expression such as string, object, @record, or @record[].`,
      sourceLocation
    ));
    return { issues };
  }

  const baseKind = candidate.base?.kind;
  const baseName =
    typeof candidate.base?.name === 'string'
      ? candidate.base.name.trim()
      : '';
  const isArray = candidate.isArray === true;
  const optional = candidate.optional === true;

  if (baseKind === 'primitive' && isSessionPrimitiveType(baseName)) {
    return {
      issues,
      type: {
        kind: 'primitive',
        name: baseName,
        isArray,
        optional
      }
    };
  }

  if (baseKind === 'record' && baseName.length > 0) {
    const definition = resolveRecord?.(baseName);
    if (!definition) {
      issues.push(issue(
        'UNKNOWN_SESSION_SLOT_RECORD',
        `Session slot '${slotName}' references unknown record '@${baseName}'.`,
        sourceLocation
      ));
      return { issues };
    }

    if (!canUseRecordForSessionSlot(definition)) {
      issues.push(issue(
        'INVALID_SESSION_SLOT_RECORD',
        `Record '@${baseName}' cannot be used as a session slot type. Session slot records must be input-capable, open-display, and must not define when-rules.`,
        sourceLocation
      ));
      return { issues };
    }

    return {
      issues,
      type: {
        kind: 'record',
        name: definition.name,
        definition,
        isArray,
        optional
      }
    };
  }

  issues.push(issue(
    'INVALID_SESSION_SLOT_TYPE',
    `Session slot '${slotName}' uses an unsupported type expression.`,
    sourceLocation
  ));
  return { issues };
}

export function buildSessionDefinition(args: {
  identifier: string;
  sourceLocation?: SourceLocation;
  valueNode: SessionSchemaObjectNode | undefined;
} & BuildSessionDefinitionOptions): SessionDefinitionBuildResult {
  const {
    filePath,
    identifier,
    isToolsCollection,
    resolveRecord,
    securityLabels,
    sourceLocation,
    valueNode
  } = args;
  const issues: StaticValidationIssue[] = [];
  const slots: Record<string, SessionSlotBinding> = {};
  const normalizedSourceLocation =
    sourceLocation && filePath && !sourceLocation.filePath
      ? { ...sourceLocation, filePath }
      : sourceLocation;

  if (isToolsCollection) {
    issues.push(issue(
      'INVALID_SESSION_DECLARATION',
      'Session schemas cannot be combined with `var tools`.',
      normalizedSourceLocation
    ));
  }

  if (Array.isArray(securityLabels) && securityLabels.some(label =>
    label === 'secret' || label === 'untrusted' || label === 'pii'
  )) {
    issues.push(issue(
      'INVALID_SESSION_LABEL',
      'Session schemas cannot carry secret, untrusted, or pii labels.',
      normalizedSourceLocation
    ));
  }

  const entries = Array.isArray(valueNode?.entries) ? valueNode.entries : [];
  for (const entry of entries) {
    const entryLocation = toLocation(entry.location, filePath, normalizedSourceLocation);

    if (!entry || (entry.type !== 'pair' && entry.type !== 'conditionalPair')) {
      issues.push(issue(
        'INVALID_SESSION_SCHEMA_ENTRY',
        'Session schemas only support static key/value slot declarations.',
        entryLocation
      ));
      continue;
    }

    const slotName = readSessionKey(entry.key);
    if (!slotName) {
      issues.push(issue(
        'INVALID_SESSION_SCHEMA_KEY',
        'Session schema keys must be static identifiers or quoted strings.',
        entryLocation
      ));
      continue;
    }

    if (slots[slotName]) {
      issues.push(issue(
        'DUPLICATE_SESSION_SLOT',
        `Duplicate session slot '${slotName}'.`,
        entryLocation
      ));
      continue;
    }

    const typeResult = normalizeSessionSlotType({
      slotName,
      node: entry.value,
      sourceLocation: entryLocation,
      resolveRecord
    });
    if (!typeResult.type) {
      issues.push(...typeResult.issues);
      continue;
    }

    slots[slotName] = {
      name: slotName,
      type: typeResult.type,
      location: entryLocation
    };
  }

  if (issues.length > 0) {
    return { issues };
  }

  return {
    definition: {
      id: createSessionDeclarationId(identifier, normalizedSourceLocation),
      canonicalName: identifier,
      originPath: normalizedSourceLocation?.filePath,
      slots,
      location: normalizedSourceLocation
    },
    issues
  };
}

export function buildSessionDefinitionFromDirective(
  directive: {
    values?: {
      identifier?: Array<{ identifier?: string }>;
      securityLabels?: string[];
      value?: unknown[];
    };
    meta?: {
      isSessionLabel?: boolean;
      isToolsCollection?: boolean;
      securityLabels?: string[];
    };
    raw?: {
      identifier?: string;
    };
    location?: {
      start?: unknown;
      end?: unknown;
    };
  },
  options: BuildSessionDefinitionOptions = {}
): SessionDefinitionBuildResult {
  const identifierNode = directive.values?.identifier?.[0];
  const identifier =
    typeof identifierNode?.identifier === 'string' && identifierNode.identifier.trim().length > 0
      ? identifierNode.identifier.trim()
      : directive.raw?.identifier?.trim();
  const sourceLocation = toLocation(directive.location, options.filePath);
  if (!identifier) {
    return {
      issues: [
        issue(
          'INVALID_SESSION_DECLARATION',
          'Session directive is missing a name.',
          sourceLocation
        )
      ]
    };
  }

  const valueNode =
    Array.isArray(directive.values?.value) && directive.values.value.length > 0
      ? directive.values.value[0] as SessionSchemaObjectNode | undefined
      : undefined;

  return buildSessionDefinition({
    identifier,
    sourceLocation,
    valueNode,
    filePath: options.filePath,
    isToolsCollection:
      options.isToolsCollection ??
      directive.meta?.isToolsCollection === true,
    resolveRecord: options.resolveRecord,
    securityLabels:
      options.securityLabels ??
      directive.values?.securityLabels ??
      directive.meta?.securityLabels
  });
}
