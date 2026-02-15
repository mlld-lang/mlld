import {
  wrapStructured,
  type StructuredValue
} from '../../../utils/structured-value';

const STRUCTURED_PIPELINE_LANGUAGES = new Set([
  'mlld-for',
  'mlld-foreach',
  'mlld-loop',
  'js',
  'javascript',
  'node',
  'nodejs',
  'python'
]);

export function shouldAutoParsePipelineInput(language?: string | null): boolean {
  if (!language) return false;
  return STRUCTURED_PIPELINE_LANGUAGES.has(language.toLowerCase());
}

export function parseStructuredJson(text: string): any | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const firstChar = trimmed[0];
  const scalarJsonPattern = /^(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/;
  const shouldAttemptScalarParse = scalarJsonPattern.test(trimmed);
  if (firstChar !== '{' && firstChar !== '[' && !shouldAttemptScalarParse) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    if (
      parsed === null ||
      typeof parsed === 'number' ||
      typeof parsed === 'boolean'
    ) {
      return parsed;
    }
  } catch {
    const sanitized = sanitizeJsonStringControlChars(trimmed);
    if (sanitized !== trimmed) {
      try {
        const reparsed = JSON.parse(sanitized);
        if (reparsed && typeof reparsed === 'object') {
          return reparsed;
        }
        if (
          reparsed === null ||
          typeof reparsed === 'number' ||
          typeof reparsed === 'boolean'
        ) {
          return reparsed;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function sanitizeJsonStringControlChars(input: string): string {
  let inString = false;
  let escaping = false;
  let changed = false;
  let result = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escaping) {
      result += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (inString) {
      const code = char.charCodeAt(0);
      if (code >= 0 && code < 0x20) {
        changed = true;
        switch (char) {
          case '\n':
            result += '\\n';
            continue;
          case '\r':
            result += '\\r';
            continue;
          case '\t':
            result += '\\t';
            continue;
          case '\f':
            result += '\\f';
            continue;
          case '\b':
            result += '\\b';
            continue;
          case '\v':
            result += '\\u000b';
            continue;
          default:
            result += `\\u${code.toString(16).padStart(4, '0')}`;
            continue;
        }
      }
    }

    result += char;
  }

  return changed ? result : input;
}

/**
 * Maintain text/data duality on parsed pipeline values.
 * WHY: Pipelines auto-parse JSON for native stages but downstream
 *      string-based transformers still expect the original text view.
 * CONTEXT: Hooks stay non-enumerable to avoid leaking helper props
 *          into user iteration or JSON serialization.
 */
function attachOriginalTextHooks(target: any, original: string): void {
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
    return;
  }
  try {
    Object.defineProperty(target, 'text', {
      value: original,
      enumerable: false,
      configurable: true
    });
  } catch {}
  try {
    Object.defineProperty(target, 'raw', {
      value: original,
      enumerable: false,
      configurable: true
    });
  } catch {}
  try {
    Object.defineProperty(target, 'data', {
      get: () => target,
      enumerable: false,
      configurable: true
    });
  } catch {}
  try {
    Object.defineProperty(target, 'toString', {
      value: () => original,
      enumerable: false,
      configurable: true
    });
  } catch {}
  try {
    Object.defineProperty(target, 'valueOf', {
      value: () => original,
      enumerable: false,
      configurable: true
    });
  } catch {}
  try {
    Object.defineProperty(target, Symbol.toPrimitive, {
      value: (hint: string) => {
        if (hint === 'number') {
          const coerced = Number(original);
          return Number.isNaN(coerced) ? original : coerced;
        }
        return original;
      },
      enumerable: false,
      configurable: true
    });
  } catch {}
}

/**
 * Provide string fallbacks for structured pipeline data via Proxy.
 * WHY: Stage chaining mixes native mlld (object/array access) with
 *      transformers that call string helpers like `.trim()`.
 * CONTEXT: Delegates unknown properties to String.prototype so the
 *          proxy behaves like the original text when requested.
 */
export function wrapPipelineStructuredValue<T extends object>(parsedValue: T, original: string): T {
  if (!parsedValue || typeof parsedValue !== 'object') {
    return parsedValue;
  }

  attachOriginalTextHooks(parsedValue, original);

  const stringPrototype = String.prototype as Record<PropertyKey, any>;

  const proxy = new Proxy(parsedValue as Record<PropertyKey, any>, {
    get(target, prop, receiver) {
      if (prop === 'text' || prop === 'raw' || prop === 'data') {
        return Reflect.get(target, prop, receiver);
      }
      if (prop === Symbol.toPrimitive) {
        const primitive = Reflect.get(target, prop, receiver);
        if (typeof primitive === 'function') {
          return primitive;
        }
        return (hint: string) => {
          if (hint === 'number') {
            const numeric = Number(original);
            return Number.isNaN(numeric) ? original : numeric;
          }
          return original;
        };
      }

      if (prop === 'toString' || prop === 'valueOf') {
        return Reflect.get(target, prop, receiver);
      }

      if (prop === 'length' && !Reflect.has(target, prop) && typeof original === 'string') {
        return original.length;
      }

      if (Reflect.has(target, prop)) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      }

      if (typeof original === 'string') {
        if (prop in stringPrototype) {
          const candidate = stringPrototype[prop];
          if (typeof candidate === 'function') {
            return candidate.bind(original);
          }
          return candidate;
        }
        if (prop === Symbol.iterator) {
          const iterator = stringPrototype[Symbol.iterator];
          if (typeof iterator === 'function') {
            return iterator.bind(original);
          }
        }
      }

      return undefined;
    },
    has(target, prop) {
      if (prop === 'text' || prop === 'raw' || prop === 'data') {
        return true;
      }
      if (typeof original === 'string' && (prop in stringPrototype)) {
        return true;
      }
      return Reflect.has(target, prop);
    },
    ownKeys(target) {
      const keys = new Set<PropertyKey>(Reflect.ownKeys(target));
      keys.add('text');
      keys.add('raw');
      keys.add('data');
      return Array.from(keys);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop === 'text' || prop === 'raw') {
        return {
          configurable: true,
          enumerable: false,
          value: original
        };
      }
      if (prop === 'data') {
        return {
          configurable: true,
          enumerable: false,
          value: target
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    set(target, prop, value, receiver) {
      return Reflect.set(target, prop, value, receiver);
    }
  });

  return proxy as T;
}

export function wrapJsonLikeString(text: string): StructuredValue | null {
  if (typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const firstChar = trimmed[0];
  if (firstChar !== '{' && firstChar !== '[') {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return wrapStructured(parsed, 'array', text);
    }
    if (parsed !== null && typeof parsed === 'object') {
      return wrapStructured(parsed, 'object', text);
    }
  } catch (error) {
    if (process.env.MLLD_DEBUG === 'true') {
      try {
        const codes = Array.from(trimmed).map(ch => ch.charCodeAt(0));
        const details = error instanceof Error ? error.stack || error.message : String(error);
        console.error('[wrapJsonLikeString] Failed to parse JSON-like text:', JSON.stringify(text), codes, details);
      } catch {}
    }
    return null;
  }

  return null;
}
