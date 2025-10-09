import {
  isLoadContentResult,
  isLoadContentResultArray,
  type LoadContentResult
} from '@core/types/load-content';
import {
  getVariableMetadata,
  hasVariableMetadata
} from './variable-migration';
import {
  wrapStructured,
  isStructuredValue,
  type StructuredValue,
  type StructuredValueMetadata,
  type StructuredValueType
} from './structured-value';

function detectStructuredType(value: unknown): StructuredValueType {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value !== null && typeof value === 'object') {
    return 'object';
  }
  return 'json';
}

function tryParseJson(text: string): { success: boolean; value?: unknown } {
  if (typeof text !== 'string') {
    return { success: false };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { success: false };
  }

  try {
    return { success: true, value: JSON.parse(trimmed) };
  } catch {
    return { success: false };
  }
}

function buildMetadata(base?: StructuredValueMetadata, extra?: StructuredValueMetadata): StructuredValueMetadata | undefined {
  if (!base && !extra) {
    return undefined;
  }
  return {
    ...(base || {}),
    ...(extra || {})
  };
}

function extractLoadContentMetadata(result: LoadContentResult): StructuredValueMetadata {
  const metadata: StructuredValueMetadata = {
    source: 'load-content'
  };

  if ('filename' in result && result.filename) metadata.filename = result.filename;
  if ('relative' in result && result.relative) metadata.relative = result.relative;
  if ('absolute' in result && result.absolute) metadata.absolute = result.absolute;
  if ('url' in result && result.url) metadata.url = result.url;
  if ('status' in (result as any) && (result as any).status !== undefined) metadata.status = (result as any).status;
  if ('headers' in (result as any) && (result as any).headers) metadata.headers = (result as any).headers;

  return metadata;
}

function deriveArrayText(value: any[]): string {
  if (typeof value.toString === 'function' && value.toString !== Array.prototype.toString) {
    return value.toString();
  }
  try {
    return JSON.stringify(value);
  } catch {
    return value.map(item => String(item)).join('\n');
  }
}

export function wrapLoadContentValue(value: any): StructuredValue {
  if (isStructuredValue(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return wrapStructured(value, 'text', value, { source: 'load-content' });
  }

  if (isLoadContentResult(value)) {
    const baseMetadata = extractLoadContentMetadata(value);
    const metadata: StructuredValueMetadata = {
      ...baseMetadata,
      loadResult: value
    };
    const contentText = typeof value.content === 'string' ? value.content : String(value.content ?? '');
    const parsedFromContent = tryParseJson(contentText);
    if (parsedFromContent.success) {
      const data = parsedFromContent.value;
      return wrapStructured(data, detectStructuredType(data), contentText, metadata);
    }
    const parsed = value.json;
    if (parsed !== undefined) {
      return wrapStructured(parsed, detectStructuredType(parsed), contentText, metadata);
    }
    return wrapStructured(value, 'object', contentText, metadata);
  }

  if (Array.isArray(value)) {
    const baseMetadata: StructuredValueMetadata = {
      source: 'load-content',
      length: value.length
    };

    // Preserve original variable metadata if tagged
    const variableMetadata = hasVariableMetadata(value) ? getVariableMetadata(value) : undefined;
    const metadata = buildMetadata(
      baseMetadata,
      variableMetadata?.metadata
        ? { variableMetadata: variableMetadata.metadata }
        : undefined
    );

    return wrapStructured(value, 'array', deriveArrayText(value), metadata);
  }

  if (isLoadContentResultArray(value)) {
    const text = value.map(item => item.content).join('\n\n');
    const metadata: StructuredValueMetadata = {
      source: 'load-content',
      length: value.length,
      loadResult: value
    };
    return wrapStructured(value, 'array', text, metadata);
  }

  const fallbackText =
    typeof value === 'string'
      ? value
      : (() => {
          try {
            return JSON.stringify(value);
          } catch {
            return String(value ?? '');
          }
        })();

  return wrapStructured(value, 'object', fallbackText, { source: 'load-content' });
}
