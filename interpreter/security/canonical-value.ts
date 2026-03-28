import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';

function unwrapCanonicalValue(value: unknown): unknown {
  if (isVariable(value)) {
    return unwrapCanonicalValue(value.value);
  }
  if (isStructuredValue(value)) {
    return unwrapCanonicalValue(asData(value));
  }
  return value;
}

export function encodeCanonicalValue(value: unknown): string | undefined {
  const raw = unwrapCanonicalValue(value);

  const encode = (entry: unknown, seen: WeakSet<object>): string | undefined => {
    if (entry === undefined) {
      return 'undefined';
    }
    if (entry === null) {
      return 'null';
    }
    if (typeof entry === 'string') {
      return `string:${JSON.stringify(entry)}`;
    }
    if (typeof entry === 'number') {
      return Number.isNaN(entry) ? 'number:NaN' : `number:${entry}`;
    }
    if (typeof entry === 'boolean') {
      return `boolean:${entry ? '1' : '0'}`;
    }
    if (Array.isArray(entry)) {
      const items: string[] = [];
      for (const item of entry) {
        const encoded = encode(item, seen);
        if (encoded === undefined) {
          return undefined;
        }
        items.push(encoded);
      }
      return `array:[${items.join(',')}]`;
    }
    if (!entry || typeof entry !== 'object') {
      return undefined;
    }
    if (seen.has(entry as object)) {
      return undefined;
    }
    seen.add(entry as object);

    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const encoded = encode(record[key], seen);
      if (encoded === undefined) {
        return undefined;
      }
      parts.push(`${JSON.stringify(key)}:${encoded}`);
    }
    return `object:{${parts.join(',')}}`;
  };

  return encode(raw, new WeakSet<object>());
}
