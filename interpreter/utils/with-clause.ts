import { convertEntriesToProperties } from './object-compat';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

export function normalizeWithClauseFields(withClause: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(withClause)) {
    return undefined;
  }

  const normalized: Record<string, unknown> = {};
  let foundField = false;

  for (const [key, value] of Object.entries(withClause)) {
    const inlineFields = extractInlineObjectFields(value);
    if (inlineFields) {
      Object.assign(normalized, inlineFields);
      foundField = true;
      continue;
    }

    normalized[key] = value;
    foundField = true;
  }

  return foundField ? normalized : undefined;
}

export function getWithClauseField(withClause: unknown, field: string): unknown {
  return normalizeWithClauseFields(withClause)?.[field];
}
