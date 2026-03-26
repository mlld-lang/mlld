import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import type {
  RecordDirectiveNode,
  RecordDefinition,
  RecordFieldDefinition,
  RecordDisplayEntry,
  RecordWhenCondition
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
    assertRecordFieldIsPure(field, name);
  }

  const hasDisplayClause = Object.prototype.hasOwnProperty.call(directive.values ?? {}, 'display');
  const display = hasDisplayClause
    ? normalizeDisplayEntries(directive.values?.display ?? [], fields, name)
    : undefined;

  const when = directive.values?.when;
  if (Array.isArray(when)) {
    for (const rule of when) {
      assertRecordConditionIsSupported(rule.condition, name);
    }
  }

  const definition: RecordDefinition = {
    name,
    fields,
    ...(hasDisplayClause ? { display: display ?? [] } : {}),
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
  return fields.map(field => ({
    ...field,
    classification
  }));
}

function normalizeDisplayEntries(
  entries: RecordDisplayEntry[],
  fields: RecordFieldDefinition[],
  recordName: string
): RecordDisplayEntry[] {
  const fieldByName = new Map(fields.map(field => [field.name, field]));
  const seen = new Set<string>();

  return entries.map(entry => {
    const field = fieldByName.get(entry.field);
    if (!field) {
      throw new MlldInterpreterError(
        `Record '@${recordName}' display entry references unknown field '${entry.field}'`,
        'record',
        undefined,
        { code: 'INVALID_RECORD_DISPLAY' }
      );
    }
    if (field.classification !== 'fact') {
      throw new MlldInterpreterError(
        `Record '@${recordName}' display entry '${entry.field}' must reference a fact field`,
        'record',
        undefined,
        { code: 'INVALID_RECORD_DISPLAY' }
      );
    }
    if (seen.has(entry.field)) {
      throw new MlldInterpreterError(
        `Record '@${recordName}' display entry '${entry.field}' is duplicated`,
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
    if (field.source.identifier !== 'input') {
      throw new MlldInterpreterError(
        `Record '@${recordName}' input field '${field.name}' must read from @input`,
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
}
