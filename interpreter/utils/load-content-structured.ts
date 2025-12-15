import {
  isLoadContentResult,
  isLoadContentResultArray,
  type LoadContentResult,
  type LoadContentResultHTML,
  type LoadContentResultURL
} from '@core/types/load-content';
import { MlldError } from '@core/errors';
import { makeSecurityDescriptor, mergeDescriptors } from '@core/types/security';
import { labelsForPath } from '@core/security/paths';
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

function parseJsonWithContext(text: string, sourceLabel: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error: any) {
    const message = error?.message ? ` (${error.message})` : '';
    throw new MlldError(`Failed to parse JSON from ${sourceLabel}${message}`);
  }
}

function parseJsonLines(text: string, sourceLabel: string): unknown[] {
  const lines = text.split(/\r?\n/);
  const results: unknown[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      results.push(JSON.parse(line));
    } catch (error: any) {
      const message = error?.message ? ` (${error.message})` : '';
      throw new MlldError(`Failed to parse JSONL from ${sourceLabel} at line ${i + 1}${message}`, {
        line: i + 1,
        offendingLine: line
      });
    }
  }
  return results;
}

function isProbablyURL(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

function buildLoadSecurityDescriptor(result: LoadContentResult) {
  if (!result.absolute || isProbablyURL(result.absolute)) {
    return undefined;
  }
  const dirLabels = labelsForPath(result.absolute);
  return makeSecurityDescriptor({
    taint: ['src:file', ...dirLabels],
    sources: [result.absolute]
  });
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

  const security = buildLoadSecurityDescriptor(result);
  if (security) {
    metadata.security = metadata.security
      ? mergeDescriptors(metadata.security, security)
      : security;
  }

  return metadata;
}

function deriveArrayText(value: any[]): string {
  if (typeof value.toString === 'function' && value.toString !== Array.prototype.toString) {
    return value.toString();
  }

  // For LoadContentResultArray (glob results), concatenate file contents
  if (value.length > 0 && isLoadContentResult(value[0])) {
    return value.map(item => item.content ?? '').join('\n\n');
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
    const filenameLower = (value.filename || '').toLowerCase();
    const skipAutoParse = false;

    if (filenameLower.endsWith('.jsonl') && typeof value.content === 'string') {
      const data = parseJsonLines(contentText, value.filename || 'content');
      const metadata = buildMetadata(baseMetadata, { type: 'jsonl' });
      return wrapStructured(data, 'array', contentText, metadata);
    }

    if (filenameLower.endsWith('.json') && typeof value.content === 'string') {
      const data = parseJsonWithContext(contentText, value.filename || 'content');
      const metadata = buildMetadata(baseMetadata, { type: 'json' });
      return wrapStructured(data, detectStructuredType(data), contentText, metadata);
    }

    const parsedFromContent = tryParseJson(contentText);
    if (parsedFromContent.success) {
      const data = parsedFromContent.value;
      return wrapStructured(data, detectStructuredType(data), contentText, baseMetadata);
    }
    const parsed = value.json;
    if (parsed !== undefined) {
      return wrapStructured(parsed, detectStructuredType(parsed), contentText, baseMetadata);
    }
    // Default text handling: data is the content string, metadata carries file info
    return wrapStructured(contentText, 'text', contentText, baseMetadata);
  }

  if (Array.isArray(value)) {
    const baseMetadata: StructuredValueMetadata = {
      source: 'load-content',
      length: value.length
    };

    // Preserve original variable metadata if tagged
    const variableMetadata = hasVariableMetadata(value) ? getVariableMetadata(value) : undefined;
    const aggregatedSecurity = isLoadContentResultArray(value)
      ? value
          .map(item => buildLoadSecurityDescriptor(item))
          .filter((descriptor): descriptor is NonNullable<ReturnType<typeof buildLoadSecurityDescriptor>> =>
            Boolean(descriptor)
          )
      : [];
    const mergedSecurity =
      aggregatedSecurity.length > 0 ? mergeDescriptors(...aggregatedSecurity) : undefined;

    const metadata = buildMetadata(
      baseMetadata,
      variableMetadata?.ctx
        ? { variableMetadata: variableMetadata.ctx }
        : undefined
    );
    const finalMetadata = mergedSecurity
      ? buildMetadata(metadata, { security: mergedSecurity })
      : metadata;

    return wrapStructured(value, 'array', deriveArrayText(value), finalMetadata);
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
