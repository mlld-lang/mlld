import type { StructuredValueType } from './structured-value';
import { isStructuredValue } from './structured-value';

export interface TransformerNormalization {
  value: unknown;
  options?: {
    type?: StructuredValueType;
    text?: string;
  };
}

function inferStructuredType(value: unknown): StructuredValueType | undefined {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value !== null && typeof value === 'object') {
    return 'object';
  }
  return 'json';
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

export function normalizeTransformerResult(
  transformerName: string | undefined,
  result: unknown
): TransformerNormalization {
  if (!transformerName) {
    return { value: result };
  }

  const normalizedName = transformerName.toLowerCase();

  if (normalizedName === 'json') {
    if (isStructuredValue(result)) {
      return { value: result };
    }

    if (typeof result === 'string') {
      const trimmed = result.trim();
      if (trimmed) {
        try {
          const parsed = JSON.parse(result);
          const type = inferStructuredType(parsed);
          return {
            value: parsed,
            options: {
              type,
              text: result
            }
          };
        } catch {
          // Ignore parse failure, fall through to legacy behaviour
        }
      }
      return { value: result };
    }

    if (result !== null && typeof result === 'object') {
      return {
        value: result,
        options: {
          type: inferStructuredType(result),
          text: safeStringify(result)
        }
      };
    }
  }

  return { value: result };
}
