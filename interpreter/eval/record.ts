import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import type {
  RecordDirectiveNode,
  RecordDefinition,
  RecordDataTrustLevel,
  RecordFieldDefinition,
  RecordDisplayConfig,
  RecordDisplayDeclaration,
  RecordDisplayEntry,
  RecordWhenCondition,
  RecordWhenResult,
  RecordRootMode
} from '@core/types/record';
import { MlldInterpreterError } from '@core/errors';
import { astLocationToSourceLocation } from '@core/types';

const DEFAULT_VALIDATE_MODE = 'demote';

export async function evaluateRecord(
  directive: RecordDirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const identifierNode = directive.values?.identifier?.[0];
  const name =
    identifierNode && identifierNode.type === 'VariableReference'
      ? identifierNode.identifier
      : directive.raw?.identifier;

  if (!name) {
    throw new MlldInterpreterError(
      'Record directive is missing a name',
      'record',
      astLocationToSourceLocation(directive.location, env.getCurrentFilePath()),
      {
        code: 'INVALID_RECORD_NAME'
      }
    );
  }

  const unsupported = directive.values?.unsupported ?? [];
  const unsupportedKey = unsupported.find(entry => entry.key === 'key');
  if (unsupportedKey) {
    throw new MlldInterpreterError(
      "Record 'key' is deferred. Phase 1 records support facts, data, when, and validate only.",
      'record',
      astLocationToSourceLocation(directive.location, env.getCurrentFilePath()),
      { code: 'RECORD_KEY_UNSUPPORTED' }
    );
  }

  const facts = normalizeFields(directive.values?.facts ?? [], 'fact');
  const data = normalizeFields(directive.values?.data ?? [], 'data');
  const fields = [...facts, ...data];
  if (fields.length === 0) {
    throw new MlldInterpreterError(
      `Record '@${name}' must define at least one fact or data field`,
      'record',
      astLocationToSourceLocation(directive.location, env.getCurrentFilePath()),
      {
        code: 'INVALID_RECORD_FIELDS'
      }
    );
  }

  const seen = new Set<string>();
  const fieldByName = new Map<string, RecordFieldDefinition>();
  for (const field of fields) {
    if (seen.has(field.name)) {
      throw new MlldInterpreterError(
        `Record '@${name}' defines duplicate field '${field.name}'`,
        'record',
        astLocationToSourceLocation(directive.location, env.getCurrentFilePath()),
        {
          code: 'INVALID_RECORD_FIELDS'
        }
      );
    }
    seen.add(field.name);
    fieldByName.set(field.name, field);
    assertRecordFieldIsPure(field, name);
  }

  const display = normalizeDisplay(directive.values?.display, fields, name);

  const when = directive.values?.when;
  if (Array.isArray(when)) {
    for (const rule of when) {
      assertRecordConditionIsSupported(rule.condition, name);
      assertRecordWhenOverridesAreSupported(rule.result, fieldByName, name);
    }
  }

  const definition: RecordDefinition = {
    name,
    fields,
    rootMode: inferRecordRootMode(fields),
    display,
    validate: directive.values?.validate ?? DEFAULT_VALIDATE_MODE,
    ...(Array.isArray(when) && when.length > 0 ? { when: [...when] } : {}),
    location: astLocationToSourceLocation(directive.location, env.getCurrentFilePath())
  };

  env.registerRecordDefinition(name, definition);
  return {
    value: definition,
    env
  };
}

function normalizeFields(
  fields: RecordFieldDefinition[],
  classification: 'fact' | 'data'
): RecordFieldDefinition[] {
  return fields.map(field => {
    if (classification === 'fact') {
      return {
        ...field,
        classification,
        dataTrust: undefined
      };
    }

    return {
      ...field,
      classification,
      dataTrust: normalizeRecordDataTrustLevel(field.dataTrust)
    };
  });
}

function normalizeRecordDataTrustLevel(
  value: unknown
): RecordDataTrustLevel {
  return value === 'trusted' ? 'trusted' : 'untrusted';
}

function normalizeDisplay(
  declaration: RecordDisplayDeclaration | undefined,
  fields: RecordFieldDefinition[],
  recordName: string
): RecordDisplayConfig {
  if (!declaration) {
    return { kind: 'open' };
  }

  if (declaration.kind === 'legacy') {
    return {
      kind: 'legacy',
      entries: normalizeDisplayEntries(declaration.entries, fields, recordName)
    };
  }

  const normalizedModes: Record<string, RecordDisplayEntry[]> = {};
  for (const [modeName, entries] of Object.entries(declaration.modes)) {
    if (modeName.trim().toLowerCase() === 'strict') {
      throw new MlldInterpreterError(
        `Record '@${recordName}' cannot declare display mode 'strict'`,
        'record',
        undefined,
        { code: 'INVALID_RECORD_DISPLAY' }
      );
    }
    normalizedModes[modeName] = normalizeDisplayEntries(entries, fields, recordName, modeName);
  }

  return {
    kind: 'named',
    modes: normalizedModes
  };
}

function normalizeDisplayEntries(
  entries: RecordDisplayEntry[],
  fields: RecordFieldDefinition[],
  recordName: string,
  modeName?: string
): RecordDisplayEntry[] {
  const fieldByName = new Map(fields.map(field => [field.name, field]));
  const seen = new Set<string>();
  const modePrefix = modeName ? ` display mode '${modeName}'` : '';

  return entries.map(entry => {
    const field = fieldByName.get(entry.field);
    if (!field) {
      throw new MlldInterpreterError(
        `Record '@${recordName}'${modePrefix} references unknown field '${entry.field}'`,
        'record',
        undefined,
        { code: 'INVALID_RECORD_DISPLAY' }
      );
    }
    if (field.classification !== 'fact' && entry.kind !== 'bare') {
      throw new MlldInterpreterError(
        `Record '@${recordName}'${modePrefix} entry '${entry.field}' must reference a fact field`,
        'record',
        undefined,
        { code: 'INVALID_RECORD_DISPLAY' }
      );
    }
    if (seen.has(entry.field)) {
      throw new MlldInterpreterError(
        `Record '@${recordName}'${modePrefix} entry '${entry.field}' is duplicated`,
        'record',
        undefined,
        { code: 'INVALID_RECORD_DISPLAY' }
      );
    }
    seen.add(entry.field);
    return { ...entry };
  });
}

function assertRecordFieldIsPure(field: RecordFieldDefinition, recordName: string): void {
  if (field.kind === 'input') {
    if (!['input', 'key', 'value'].includes(field.source.identifier)) {
      throw new MlldInterpreterError(
        `Record '@${recordName}' input field '${field.name}' must read from @input, @key, or @value`,
        'record',
        undefined,
        { code: 'INVALID_RECORD_FIELD' }
      );
    }
    return;
  }

  const visited = new Set<unknown>();
  const stack: unknown[] = [field.expression];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || visited.has(current)) {
      continue;
    }
    visited.add(current);

    const nodeType = (current as { type?: unknown }).type;
    if (
      nodeType === 'Directive' ||
      nodeType === 'ExecInvocation' ||
      nodeType === 'load-content' ||
      nodeType === 'command' ||
      nodeType === 'code' ||
      nodeType === 'foreach-command'
    ) {
      throw new MlldInterpreterError(
        `Record '@${recordName}' computed field '${field.name}' must be pure`,
        'record',
        undefined,
        { code: 'INVALID_RECORD_FIELD' }
      );
    }

    for (const value of Object.values(current as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          stack.push(item);
        }
      } else {
        stack.push(value);
      }
    }
  }
}

function assertRecordConditionIsSupported(condition: RecordWhenCondition, recordName: string): void {
  if (condition.type === 'wildcard') {
    return;
  }
  if (typeof condition.field !== 'string' || condition.field.length === 0) {
    throw new MlldInterpreterError(
      `Record '@${recordName}' has an invalid when condition`,
      'record',
      undefined,
      { code: 'INVALID_RECORD_WHEN' }
    );
  }
  if (
    condition.sourceRoot &&
    condition.path &&
    (!Array.isArray(condition.path) || condition.path.some(segment => typeof segment !== 'string' || segment.length === 0))
  ) {
    throw new MlldInterpreterError(
      `Record '@${recordName}' has an invalid when condition`,
      'record',
      undefined,
      { code: 'INVALID_RECORD_WHEN' }
    );
  }
}

function assertRecordWhenOverridesAreSupported(
  result: RecordWhenResult,
  fieldByName: ReadonlyMap<string, RecordFieldDefinition>,
  recordName: string
): void {
  if (result.type !== 'tiers' || !result.overrides?.data) {
    return;
  }

  const seen = new Set<string>();
  for (const [trust, fields] of Object.entries(result.overrides.data)) {
    if (trust !== 'trusted' && trust !== 'untrusted') {
      throw new MlldInterpreterError(
        `Record '@${recordName}' has an invalid when override`,
        'record',
        undefined,
        { code: 'INVALID_RECORD_WHEN' }
      );
    }
    if (!Array.isArray(fields)) {
      throw new MlldInterpreterError(
        `Record '@${recordName}' has an invalid when override`,
        'record',
        undefined,
        { code: 'INVALID_RECORD_WHEN' }
      );
    }
    for (const fieldName of fields) {
      if (typeof fieldName !== 'string' || fieldName.length === 0) {
        throw new MlldInterpreterError(
          `Record '@${recordName}' has an invalid when override`,
          'record',
          undefined,
          { code: 'INVALID_RECORD_WHEN' }
        );
      }
      if (seen.has(fieldName)) {
        throw new MlldInterpreterError(
          `Record '@${recordName}' reclassifies field '${fieldName}' more than once in a when branch`,
          'record',
          undefined,
          { code: 'INVALID_RECORD_WHEN' }
        );
      }
      const field = fieldByName.get(fieldName);
      if (!field) {
        throw new MlldInterpreterError(
          `Record '@${recordName}' when override references unknown field '${fieldName}'`,
          'record',
          undefined,
          { code: 'INVALID_RECORD_WHEN' }
        );
      }
      if (field.classification !== 'data') {
        throw new MlldInterpreterError(
          `Record '@${recordName}' when override can only reclassify data field '${fieldName}'`,
          'record',
          undefined,
          { code: 'INVALID_RECORD_WHEN' }
        );
      }
      seen.add(fieldName);
    }
  }
}

function inferRecordRootMode(fields: RecordFieldDefinition[]): RecordRootMode {
  let usesMapEntryRoot = false;
  let hasBareInputRoot = false;
  let hasNestedInputAccess = false;

  const visitExpression = (node: unknown): void => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const candidate = node as { type?: unknown; identifier?: unknown; fields?: unknown };
    if (candidate.type === 'VariableReference' && typeof candidate.identifier === 'string') {
      if (candidate.identifier === 'key' || candidate.identifier === 'value') {
        usesMapEntryRoot = true;
      }
      if (candidate.identifier === 'input') {
        const fields = Array.isArray(candidate.fields) ? candidate.fields : [];
        if (fields.length === 0) {
          hasBareInputRoot = true;
        } else {
          hasNestedInputAccess = true;
        }
      }
    }

    for (const value of Object.values(node as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          visitExpression(item);
        }
      } else {
        visitExpression(value);
      }
    }
  };

  for (const field of fields) {
    if (field.kind === 'input') {
      if (field.sourceRoot === 'key' || field.sourceRoot === 'value') {
        usesMapEntryRoot = true;
      }
      const sourceFields = Array.isArray(field.source.fields) ? field.source.fields : [];
      if (field.sourceRoot === 'input') {
        if (sourceFields.length === 0) {
          hasBareInputRoot = true;
        } else {
          hasNestedInputAccess = true;
        }
      }
      continue;
    }
    visitExpression(field.expression);
  }

  if (usesMapEntryRoot) {
    return 'map-entry';
  }
  if (hasBareInputRoot && !hasNestedInputAccess) {
    return 'scalar';
  }
  return 'object';
}
