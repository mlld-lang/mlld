import { MlldInterpreterError } from '@core/errors';
import type { SourceLocation } from '@core/types';
import type { SessionDefinition, SessionPrimitiveType, SessionSlotBinding, SessionSlotType } from '@core/types/session';
import { canUseRecordForSessionSlot } from '@core/types/record';
import type { Environment } from '@interpreter/env/Environment';
import { getStaticObjectKey } from '@interpreter/utils/object-compat';

type SessionTypeNode = {
  type?: string;
  base?: {
    kind?: 'primitive' | 'record';
    name?: string;
  };
  isArray?: boolean;
  optional?: boolean;
};

function createSessionDeclarationId(identifier: string, location?: SourceLocation): string {
  const sourcePath = typeof location?.filePath === 'string' && location.filePath.trim().length > 0
    ? location.filePath.trim()
    : '<anonymous>';
  return `${sourcePath}#${identifier}`;
}

function readSessionKey(key: unknown, sourceLocation?: SourceLocation): string {
  if (typeof key === 'string' && key.trim().length > 0) {
    return key.trim();
  }

  const staticKey = getStaticObjectKey(key);
  if (typeof staticKey === 'string' && staticKey.trim().length > 0) {
    return staticKey.trim();
  }

  throw new MlldInterpreterError(
    'Session schema keys must be static identifiers or quoted strings.',
    'var',
    sourceLocation,
    { code: 'INVALID_SESSION_SCHEMA_KEY' }
  );
}

function isSessionPrimitiveType(value: unknown): value is SessionPrimitiveType {
  return value === 'string'
    || value === 'number'
    || value === 'boolean'
    || value === 'object'
    || value === 'array';
}

function normalizeSessionSlotType(
  env: Environment,
  slotName: string,
  node: unknown,
  sourceLocation?: SourceLocation
): SessionSlotType {
  const candidate = node as SessionTypeNode | undefined;
  if (candidate?.type !== 'sessionType') {
    throw new MlldInterpreterError(
      `Session slot '${slotName}' must use a type expression such as string, object, @record, or @record[].`,
      'var',
      sourceLocation,
      { code: 'INVALID_SESSION_SLOT_TYPE' }
    );
  }

  const baseKind = candidate.base?.kind;
  const baseName = typeof candidate.base?.name === 'string' ? candidate.base.name.trim() : '';
  const isArray = candidate.isArray === true;
  const optional = candidate.optional === true;

  if (baseKind === 'primitive' && isSessionPrimitiveType(baseName)) {
    return {
      kind: 'primitive',
      name: baseName,
      isArray,
      optional
    };
  }

  if (baseKind === 'record' && baseName.length > 0) {
    const definition = env.getRecordDefinition(baseName);
    if (!definition) {
      throw new MlldInterpreterError(
        `Session slot '${slotName}' references unknown record '@${baseName}'.`,
        'var',
        sourceLocation,
        { code: 'UNKNOWN_SESSION_SLOT_RECORD' }
      );
    }

    if (!canUseRecordForSessionSlot(definition)) {
      throw new MlldInterpreterError(
        `Record '@${baseName}' cannot be used as a session slot type. Session slot records must be input-capable, open-display, and must not define when-rules.`,
        'var',
        sourceLocation,
        { code: 'INVALID_SESSION_SLOT_RECORD' }
      );
    }

    return {
      kind: 'record',
      name: definition.name,
      definition,
      isArray,
      optional
    };
  }

  throw new MlldInterpreterError(
    `Session slot '${slotName}' uses an unsupported type expression.`,
    'var',
    sourceLocation,
    { code: 'INVALID_SESSION_SLOT_TYPE' }
  );
}

export function evaluateSessionSchemaObject(args: {
  env: Environment;
  identifier: string;
  sourceLocation?: SourceLocation;
  valueNode: {
    entries?: Array<{
      type?: string;
      key?: unknown;
      value?: unknown;
      location?: SourceLocation;
    }>;
  };
}): SessionDefinition {
  const { env, identifier, sourceLocation, valueNode } = args;
  const entries = Array.isArray(valueNode.entries) ? valueNode.entries : [];
  const slots: Record<string, SessionSlotBinding> = {};

  for (const entry of entries) {
    if (!entry || (entry.type !== 'pair' && entry.type !== 'conditionalPair')) {
      throw new MlldInterpreterError(
        'Session schemas only support static key/value slot declarations.',
        'var',
        sourceLocation,
        { code: 'INVALID_SESSION_SCHEMA_ENTRY' }
      );
    }

    const slotName = readSessionKey(entry.key, sourceLocation);
    if (slots[slotName]) {
      throw new MlldInterpreterError(
        `Duplicate session slot '${slotName}'.`,
        'var',
        sourceLocation,
        { code: 'DUPLICATE_SESSION_SLOT' }
      );
    }

    slots[slotName] = {
      name: slotName,
      type: normalizeSessionSlotType(env, slotName, entry.value, entry.location ?? sourceLocation),
      location: entry.location ?? sourceLocation
    };
  }

  return {
    id: createSessionDeclarationId(identifier, sourceLocation),
    canonicalName: identifier,
    originPath: sourceLocation?.filePath,
    slots,
    location: sourceLocation
  };
}
