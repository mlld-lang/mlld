/**
 * JSONPath Extraction Utilities
 *
 * Simple JSONPath-like extraction for streaming adapter data.
 *
 * Supported syntax:
 * - Dot notation: `a.b.c`
 * - Array indexing: `items[0]`, `items[1].name`
 * - Array iteration: `items[].name` (collects from all items)
 * - Fallback paths: `["primary", "fallback"]` (tries each in order)
 */

export type JSONPathExpression = string | string[];

export interface JSONPathOptions {
  returnUndefined?: boolean;
  collectArrays?: boolean;
}

/**
 * Extract a value from an object using a JSONPath-like expression.
 */
export function extractPath(
  obj: unknown,
  path: string,
  options?: JSONPathOptions
): unknown {
  if (obj === null || obj === undefined) {
    return options?.returnUndefined ? undefined : null;
  }

  const parts = parsePath(path);
  let current: unknown = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (current === null || current === undefined) {
      return options?.returnUndefined ? undefined : null;
    }

    // Array iteration: content[] means iterate and collect
    if (part.type === 'array-iterate') {
      if (!Array.isArray(current)) {
        return options?.returnUndefined ? undefined : null;
      }

      // If there are remaining path parts, collect from each item
      const remainingParts = parts.slice(i + 1);
      if (remainingParts.length > 0) {
        const remainingPath = partsToPath(remainingParts);
        return current.map(item => extractPath(item, remainingPath, options));
      }

      return current;
    }

    // Array index: content[0]
    if (part.type === 'array-index') {
      if (!Array.isArray((current as Record<string, unknown>)[part.key])) {
        return options?.returnUndefined ? undefined : null;
      }
      const arr = (current as Record<string, unknown>)[part.key] as unknown[];
      current = arr[part.index!];
      continue;
    }

    // Object key: content.text
    if (part.type === 'key') {
      if (typeof current !== 'object') {
        return options?.returnUndefined ? undefined : null;
      }
      current = (current as Record<string, unknown>)[part.key];
      continue;
    }
  }

  // Return null for undefined values unless returnUndefined is set
  if (current === undefined) {
    return options?.returnUndefined ? undefined : null;
  }

  return current;
}

/**
 * Extract a value using fallback paths.
 * Tries each path in order, returning the first non-undefined value.
 */
export function extractWithFallback(
  obj: unknown,
  pathOrPaths: JSONPathExpression,
  options?: JSONPathOptions
): unknown {
  const paths = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];

  for (const path of paths) {
    const value = extractPath(obj, path, { returnUndefined: true });
    if (value !== undefined) {
      return value;
    }
  }

  return options?.returnUndefined ? undefined : null;
}

/**
 * Extract multiple fields from an object.
 */
export function extractFields(
  obj: unknown,
  fields: Record<string, JSONPathExpression>,
  options?: JSONPathOptions
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [name, pathOrPaths] of Object.entries(fields)) {
    const value = extractWithFallback(obj, pathOrPaths, { returnUndefined: true });
    if (value !== undefined) {
      result[name] = value;
    } else if (!options?.returnUndefined) {
      result[name] = null;
    }
  }

  return result;
}

/**
 * Check if a path exists in an object.
 * Note: Returns true if the path exists, even if the value is null or undefined.
 */
export function hasPath(obj: unknown, path: string): boolean {
  if (obj === null || obj === undefined) {
    return false;
  }

  const parts = parsePath(path);
  let current: unknown = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (typeof current !== 'object' || current === null) {
      return false;
    }

    const record = current as Record<string, unknown>;

    if (part.type === 'key') {
      if (!(part.key in record)) {
        return false;
      }
      current = record[part.key];
      continue;
    }

    if (part.type === 'array-index') {
      if (!(part.key in record)) {
        return false;
      }
      const arr = record[part.key];
      if (!Array.isArray(arr) || part.index! >= arr.length) {
        return false;
      }
      current = arr[part.index!];
      continue;
    }

    // For array-iterate, just check the key exists and is an array
    if (part.type === 'array-iterate') {
      return true;
    }
  }

  return true;
}

/**
 * Get the value at a path, or a default value if not found.
 */
export function getPathOr<T>(
  obj: unknown,
  path: string,
  defaultValue: T
): T {
  const value = extractPath(obj, path, { returnUndefined: true });
  return value !== undefined ? (value as T) : defaultValue;
}

// Path parsing internals

interface PathPart {
  type: 'key' | 'array-index' | 'array-iterate';
  key: string;
  index?: number;
}

function parsePath(path: string): PathPart[] {
  const parts: PathPart[] = [];
  const segments = path.split('.');

  for (const segment of segments) {
    // Array iterate: items[]
    if (segment.endsWith('[]')) {
      const key = segment.slice(0, -2);
      if (key) {
        parts.push({ type: 'key', key });
      }
      parts.push({ type: 'array-iterate', key: '' });
      continue;
    }

    // Array index: items[0]
    const arrayMatch = segment.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      parts.push({
        type: 'array-index',
        key,
        index: parseInt(indexStr, 10)
      });
      continue;
    }

    // Regular key
    parts.push({ type: 'key', key: segment });
  }

  return parts;
}

function partsToPath(parts: PathPart[]): string {
  return parts.map(part => {
    if (part.type === 'array-iterate') {
      return '[]';
    }
    if (part.type === 'array-index') {
      return `${part.key}[${part.index}]`;
    }
    return part.key;
  }).join('.');
}
