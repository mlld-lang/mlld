import {
  isLoadContentResult,
  isLoadContentResultArray,
  type LoadContentResult,
  type LoadContentResultHTML,
  type LoadContentResultURL
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
    source: 'load-content',
    filename: result.filename,
    relative: result.relative,
    absolute: result.absolute,
    tokest: result.tokest,
    tokens: result.tokens,
    fm: result.fm,
    json: result.json,
    length: typeof result.content === 'string' ? result.content.length : undefined,
    metrics: {
      tokens: result.tokens,
      length: typeof result.content === 'string' ? result.content.length : undefined
    }
  };

  if ('url' in result && result.url) {
    const urlResult = result as LoadContentResultURL;
    metadata.url = urlResult.url;
    metadata.domain = urlResult.domain;
    if (urlResult.title) metadata.title = urlResult.title;
    if (urlResult.description) metadata.description = urlResult.description;
    if (urlResult.status !== undefined) metadata.status = urlResult.status;
    if (urlResult.headers) metadata.headers = urlResult.headers;
  }

  if ('html' in result && !(result as LoadContentResultURL).url) {
    const htmlResult = result as LoadContentResultHTML;
    metadata.html = htmlResult.html;
    if (htmlResult.title) metadata.title = htmlResult.title;
    if (htmlResult.description) metadata.description = htmlResult.description;
  }

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
    const contentText = typeof value.content === 'string' ? value.content : String(value.content ?? '');
    const parsedFromContent = tryParseJson(contentText);
    if (parsedFromContent.success) {
      const data = parsedFromContent.value;
      return wrapStructured(data, detectStructuredType(data), contentText, baseMetadata);
    }
    const parsed = value.json;
    if (parsed !== undefined) {
      return wrapStructured(parsed, detectStructuredType(parsed), contentText, baseMetadata);
    }
    return wrapStructured(value, 'object', contentText, baseMetadata);
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
      variableMetadata?.ctx
        ? { variableMetadata: variableMetadata.ctx }
        : undefined
    );

    return wrapStructured(value, 'array', deriveArrayText(value), metadata);
  }

  if (isLoadContentResultArray(value)) {
    const text = value.map(item => item.content).join('\n\n');
    const metadata: StructuredValueMetadata = {
      source: 'load-content',
      length: value.length,
      metrics: {
        length: value.length
      }
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
