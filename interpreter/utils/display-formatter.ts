import { JSONFormatter } from '../core/json-formatter';
import { isLoadContentResult } from '@core/types/load-content';
import { asText, isStructuredValue } from './structured-value';

export interface DisplayFormatOptions {
  pretty?: boolean;
  indent?: number;
  separator?: string;
  isForeachSection?: boolean;
}

export function formatForDisplay(value: unknown, options: DisplayFormatOptions = {}): string {
  const { pretty = true, indent = 2, separator = '\n', isForeachSection = false } = options;

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (isLoadContentResult(value)) {
    return asText(value);
  }

  if (isStructuredValue(value)) {
    const data = value.data;

    if (Array.isArray(data)) {
      const printableArray = data.map(item => normalizeArrayEntry(item));
      return JSONFormatter.stringify(printableArray, { pretty, indent });
    }

    if (data && typeof data === 'object') {
      if (
        value.mx?.source === 'load-content' ||
        Boolean(value.mx?.filename) ||
        Boolean(value.mx?.url)
      ) {
        return value.text;
      }
      return JSONFormatter.stringify(data, { pretty, indent });
    }

    if (typeof data === 'number' || typeof data === 'boolean') {
      return String(data);
    }

    if (data === null) {
      return 'null';
    }

    return value.text;
  }

  if (Array.isArray(value)) {
    if (isForeachSection && value.every(item => typeof item === 'string')) {
      return value.join('\n\n');
    }
    const printableArray = value.map(item => normalizeArrayEntry(item));
    return JSONFormatter.stringify(printableArray, { pretty, indent });
  }

  if (value && typeof value === 'object') {
    return JSONFormatter.stringify(value, { pretty, indent });
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function normalizeArrayEntry(item: unknown): unknown {
  if (isStructuredValue(item)) {
    const data = item.data;
    if (Array.isArray(data) || (data && typeof data === 'object')) {
      return data;
    }
    if (typeof data === 'number' || typeof data === 'boolean' || data === null) {
      return data;
    }
    return asText(item);
  }
  if (item && typeof item === 'object' && typeof (item as any).text === 'string') {
    return (item as any).text;
  }
  return item;
}
