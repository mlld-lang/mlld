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
  type StructuredValueMetadata
} from './structured-value';

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
    const metadata = extractLoadContentMetadata(value);
    return wrapStructured(value, 'object', value.content ?? '', metadata);
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
      length: value.length
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
