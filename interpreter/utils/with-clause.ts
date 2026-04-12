import { convertEntriesToProperties, getStaticObjectKey } from './object-compat';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export interface WithClauseFieldEntry {
  key: string;
  value: unknown;
  location?: unknown;
}

function extractInlineObjectFields(value: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(value) || value.type !== 'inlineValue') {
    return undefined;
  }

  const inlineValue = value.value;
  if (!isPlainObject(inlineValue) || inlineValue.type !== 'object' || !Array.isArray(inlineValue.entries)) {
    return undefined;
  }

  return convertEntriesToProperties(inlineValue.entries as any);
}

function extractInlineObjectFieldEntries(value: unknown): WithClauseFieldEntry[] | undefined {
  if (!isPlainObject(value) || value.type !== 'inlineValue') {
    return undefined;
  }

  const inlineValue = value.value;
  if (!isPlainObject(inlineValue) || inlineValue.type !== 'object' || !Array.isArray(inlineValue.entries)) {
    return undefined;
  }

  return (inlineValue.entries as Array<Record<string, unknown>>)
    .flatMap(entry => {
      if (entry.type !== 'pair' && entry.type !== 'conditionalPair') {
        return [];
      }

      const key = getStaticObjectKey(entry.key);
      if (key === undefined) {
        throw new Error('Computed object keys are not supported in this static object context');
      }

      return [{
        key,
        value: entry.value,
        location: entry.location
      }];
    });
}

export function listWithClauseFields(withClause: unknown): WithClauseFieldEntry[] {
  if (Array.isArray(withClause)) {
    return withClause.flatMap(entry => listWithClauseFields(entry));
  }

  const inlineEntries = extractInlineObjectFieldEntries(withClause);
  if (inlineEntries) {
    return inlineEntries;
  }

  if (!isPlainObject(withClause)) {
    return [];
  }

  const normalized: WithClauseFieldEntry[] = [];

  for (const [key, value] of Object.entries(withClause)) {
    const inlineEntries = extractInlineObjectFieldEntries(value);
    if (inlineEntries) {
      normalized.push(...inlineEntries);
      continue;
    }

    normalized.push({ key, value });
  }

  return normalized;
}

export function normalizeWithClauseFields(withClause: unknown): Record<string, unknown> | undefined {
  const entries = listWithClauseFields(withClause);
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries.map(entry => [entry.key, entry.value]));
}

export function getWithClauseField(withClause: unknown, field: string): unknown {
  return normalizeWithClauseFields(withClause)?.[field];
}
