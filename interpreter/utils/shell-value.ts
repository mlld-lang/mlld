import { asText, asData, isStructuredValue, type StructuredValue } from './structured-value';
import { JSONFormatter } from '../core/json-formatter';
import {
  isLoadContentResult,
  isLoadContentResultArray,
  isRenamedContentArray
} from '@core/types/load-content';

type SimpleClassification = { kind: 'simple'; text: string };
type ArrayClassification = { kind: 'array-simple'; elements: string[] };
type ComplexClassification = { kind: 'complex'; text: string };

export type ShellValueClassification =
  | SimpleClassification
  | ArrayClassification
  | ComplexClassification;

/**
 * Classify arbitrary values for shell interpolation.
 * Simple values can be interpolated directly.
 * Array-simple values expand into multiple arguments or stdin lines.
 * Complex values must be passed as a single escaped payload.
 */
export function classifyShellValue(value: unknown): ShellValueClassification {
  if (value === undefined) {
    return { kind: 'simple', text: '' };
  }

  if (value === null) {
    return { kind: 'simple', text: 'null' };
  }

  if (typeof value === 'string') {
    if (looksLikeStructuredString(value)) {
      return { kind: 'complex', text: value };
    }
    return { kind: 'simple', text: value };
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return { kind: 'simple', text: String(value) };
  }

  if (Buffer.isBuffer(value)) {
    return { kind: 'simple', text: value.toString('utf8') };
  }

  if (isStructuredValue(value)) {
    return classifyStructuredValue(value);
  }

  if (isLoadContentResult(value)) {
    return { kind: 'complex', text: value.content ?? '' };
  }

  if (isLoadContentResultArray(value)) {
    const content = typeof (value as any).content === 'string'
      ? (value as any).content
      : value.map(item => item.content ?? '').join('\n\n');
    return { kind: 'complex', text: content };
  }

  if (isRenamedContentArray(value)) {
    const elements = Array.from(value, item => String(item ?? ''));
    return { kind: 'array-simple', elements };
  }

  if (Array.isArray(value)) {
    return classifyArray(value);
  }

  if (typeof value === 'object') {
    return {
      kind: 'complex',
      text: JSONFormatter.stringify(normalizeForJson(value))
    };
  }

  return { kind: 'simple', text: String(value) };
}

/**
 * Convert a value into stdin-safe text using shell classification.
 */
export function coerceValueForStdin(value: unknown): string {
  const classification = classifyShellValue(value);
  if (classification.kind === 'simple') {
    return classification.text;
  }
  if (classification.kind === 'array-simple') {
    return classification.elements.join('\n');
  }
  return classification.text;
}

function classifyStructuredValue(value: StructuredValue): ShellValueClassification {
  const data = value.data;

  if (Array.isArray(data)) {
    return classifyArray(data);
  }

  if (data && typeof data === 'object') {
    return {
      kind: 'complex',
      text: JSONFormatter.stringify(normalizeForJson(data))
    };
  }

  return { kind: 'simple', text: asText(value) };
}

function classifyArray(array: unknown[]): ShellValueClassification {
  if (array.length === 0) {
    return { kind: 'array-simple', elements: [] };
  }

  const elements: string[] = [];
  for (const item of array) {
    const classification = classifyShellValue(item);
    if (classification.kind === 'simple') {
      elements.push(classification.text);
      continue;
    }
    return {
      kind: 'complex',
      text: JSONFormatter.stringify(normalizeForJson(array))
    };
  }

  return { kind: 'array-simple', elements };
}

function normalizeForJson(value: unknown): unknown {
  if (isStructuredValue(value)) {
    return normalizeForJson(asData(value));
  }

  if (isLoadContentResult(value)) {
    try {
      if (value.json !== undefined) {
        return value.json;
      }
    } catch {
      // Ignore json getter errors and fall back to content parsing
    }
    try {
      return JSON.parse(value.content ?? '');
    } catch {
      return value.content ?? '';
    }
  }

  if (isLoadContentResultArray(value)) {
    return value.map(item => normalizeForJson(item));
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeForJson(item));
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      normalizeForJson(val)
    ]);
    return Object.fromEntries(entries);
  }

  return value;
}

function looksLikeStructuredString(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return false;
  }

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (!((first === '[' && last === ']') || (first === '{' && last === '}'))) {
    return false;
  }

  // Require at least one structural character between the delimiters
  const inner = trimmed.slice(1, -1);
  return /[{}\[\]:,]/.test(inner);
}
