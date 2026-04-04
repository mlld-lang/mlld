import type { ShelfScopeSlotBinding, ShelfSlotDefinition } from '@core/types/shelf';
import type { Environment } from '@interpreter/env/Environment';
import { getNormalizedShelfScope, extractShelfSlotRef } from '@interpreter/shelf/runtime';
import { getRecordProjectionMetadata, isStructuredValue } from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';

type WritableShelfRow = {
  slot: string;
  type: string;
  merge: string;
  constraint: string;
  accessPath: string;
};

type ReadableShelfRow = {
  slot: string;
  type: string;
  accessPath: string;
};

function formatAliasAccessPath(alias: string): string {
  return `@fyi.shelf.${alias}`;
}

function formatBindingAccessPath(binding: ShelfScopeSlotBinding): string {
  return binding.alias
    ? formatAliasAccessPath(binding.alias)
    : `@fyi.shelf.${binding.ref.shelfName}.${binding.ref.slotName}`;
}

function formatSlotType(slot: ShelfSlotDefinition): string {
  if (slot.cardinality === 'collection') {
    return `${slot.record}[]`;
  }
  return `${slot.record}${slot.optional ? '?' : ''}`;
}

function formatMergeMode(slot: ShelfSlotDefinition, env: Environment): string {
  if (slot.merge !== 'upsert') {
    return slot.merge;
  }
  const definition = env.getRecordDefinition(slot.record);
  return definition?.key ? 'upsert by key' : 'upsert';
}

function wrapShelfNotesBlock(lines: readonly string[]): string | undefined {
  const normalized = lines.map(line => line.trimEnd());
  while (normalized.length > 0 && normalized[0].trim().length === 0) {
    normalized.shift();
  }
  while (normalized.length > 0 && normalized[normalized.length - 1].trim().length === 0) {
    normalized.pop();
  }

  if (normalized.length === 0) {
    return undefined;
  }

  return `<shelf_notes>\n${normalized.join('\n')}\n</shelf_notes>`;
}

function unwrapVariableValue(value: unknown): unknown {
  if (isVariable(value)) {
    return unwrapVariableValue(value.value);
  }
  return value;
}

function inferRuntimeTypeLabel(value: unknown): string {
  const candidate = unwrapVariableValue(value);
  if (isStructuredValue(candidate)) {
    switch (candidate.type) {
      case 'simple-text':
      case 'command-result':
      case 'text':
        return 'text';
      case 'number':
      case 'boolean':
      case 'object':
      case 'array':
      case 'null':
      case 'bigint':
        return candidate.type;
      default:
        return candidate.type;
    }
  }

  if (Array.isArray(candidate)) {
    return 'array';
  }
  if (candidate === null) {
    return 'null';
  }

  switch (typeof candidate) {
    case 'string':
      return 'text';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'bigint':
      return 'bigint';
    case 'object':
      return 'object';
    default:
      return 'unknown';
  }
}

function findRecordName(value: unknown): string | undefined {
  const candidate = unwrapVariableValue(value);
  const projection = getRecordProjectionMetadata(candidate);
  return projection?.kind === 'record' ? projection.recordName : undefined;
}

function findArrayRecordName(value: unknown): string | undefined {
  const candidate = unwrapVariableValue(value);
  if (isStructuredValue(candidate) && candidate.type === 'array' && Array.isArray(candidate.data)) {
    for (const item of candidate.data) {
      const recordName = findRecordName(item);
      if (recordName) {
        return recordName;
      }
    }
  }
  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      const recordName = findRecordName(item);
      if (recordName) {
        return recordName;
      }
    }
  }
  return undefined;
}

function inferAliasTypeLabel(value: unknown, env: Environment): string {
  const slotRef = extractShelfSlotRef(value);
  if (slotRef) {
    const slot = env.getShelfDefinition(slotRef.shelfName)?.slots[slotRef.slotName];
    if (slot) {
      return formatSlotType(slot);
    }
  }

  const recordName = findRecordName(value);
  if (recordName) {
    return recordName;
  }

  const arrayRecordName = findArrayRecordName(value);
  if (arrayRecordName) {
    return `${arrayRecordName}[]`;
  }

  return inferRuntimeTypeLabel(value);
}

function resolveSlotDefinition(env: Environment, ref: ShelfScopeSlotRef): ShelfSlotDefinition | undefined {
  return env.getShelfDefinition(ref.shelfName)?.slots[ref.slotName];
}

function buildWritableRows(env: Environment, bindings: readonly ShelfScopeSlotBinding[]): WritableShelfRow[] {
  const rows: WritableShelfRow[] = [];
  for (const binding of bindings) {
    const slot = resolveSlotDefinition(env, binding.ref);
    if (!slot) {
      continue;
    }
    const accessPath = formatBindingAccessPath(binding);
    rows.push({
      slot: accessPath,
      type: formatSlotType(slot),
      merge: formatMergeMode(slot, env),
      constraint: slot.from ? `from ${slot.from}` : '—',
      accessPath
    });
  }
  return rows;
}

function buildReadableSlotRows(
  env: Environment,
  bindings: readonly ShelfScopeSlotBinding[],
  writableRefs: ReadonlySet<string>
): ReadableShelfRow[] {
  const rows: ReadableShelfRow[] = [];
  for (const binding of bindings) {
    const key = `${binding.ref.shelfName}.${binding.ref.slotName}`;
    if (writableRefs.has(key)) {
      continue;
    }
    const slot = resolveSlotDefinition(env, binding.ref);
    if (!slot) {
      continue;
    }
    const accessPath = formatBindingAccessPath(binding);
    rows.push({
      slot: accessPath,
      type: formatSlotType(slot),
      accessPath
    });
  }
  return rows;
}

function buildAliasRows(
  env: Environment,
  aliases: Readonly<Record<string, unknown>>
): ReadableShelfRow[] {
  return Object.entries(aliases).map(([alias, value]) => ({
    slot: formatAliasAccessPath(alias),
    type: inferAliasTypeLabel(value, env),
    accessPath: formatAliasAccessPath(alias)
  }));
}

function buildUsageLines(
  writableRows: readonly WritableShelfRow[],
  readableRows: readonly ReadableShelfRow[]
): string[] {
  const lines: string[] = [];

  if (writableRows.length > 0) {
    lines.push(`Write to slots with @shelve(${writableRows[0].slot}, value).`);
  }
  if (readableRows.length > 0) {
    const examples = Array.from(new Set(readableRows.map(row => row.accessPath))).slice(0, 2);
    lines.push(`Read shelf entries with ${examples.join(' or ')}.`);
  }
  lines.push('Collection slots use [] and follow the listed Merge mode. ? marks optional singular slots. from means writes must come from the referenced slot.');

  return lines;
}

export function renderInjectedShelfNotes(env: Environment): string | undefined {
  const scope = getNormalizedShelfScope(env);
  if (!scope) {
    return undefined;
  }

  const writableRows = buildWritableRows(env, scope.writeSlotBindings);
  const writableKeys = new Set(scope.writeSlots.map(ref => `${ref.shelfName}.${ref.slotName}`));
  const readableRows = [
    ...buildReadableSlotRows(env, scope.readSlotBindings, writableKeys),
    ...buildAliasRows(env, scope.readAliases)
  ];

  if (writableRows.length === 0 && readableRows.length === 0) {
    return undefined;
  }

  const lines: string[] = [];

  if (writableRows.length > 0) {
    lines.push(
      'Writable slots:',
      '',
      '| Slot | Type | Merge | Constraint |',
      '|------|------|-------|-----------|',
      ...writableRows.map(row => `| ${row.slot} | ${row.type} | ${row.merge} | ${row.constraint} |`)
    );
  }

  if (readableRows.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(
      'Readable slots:',
      '',
      '| Slot | Type |',
      '|------|------|',
      ...readableRows.map(row => `| ${row.slot} | ${row.type} |`)
    );
  }

  lines.push('', ...buildUsageLines(writableRows, readableRows));
  return wrapShelfNotesBlock(lines);
}

export function appendShelfNotesToSystemPrompt(
  systemPrompt: unknown,
  shelfNotes: string | undefined
): string | undefined {
  if (!shelfNotes) {
    return typeof systemPrompt === 'string' ? systemPrompt : undefined;
  }

  const base = typeof systemPrompt === 'string' ? systemPrompt.trimEnd() : '';
  if (base.length === 0) {
    return shelfNotes;
  }

  return `${base}\n\n${shelfNotes}`;
}
