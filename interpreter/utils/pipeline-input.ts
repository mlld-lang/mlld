import { MlldInterpreterError } from '@core/errors';
import { jsonToXml } from './json-to-xml';
import { wrapStructured, type StructuredValue, type StructuredValueType } from './structured-value';

function parseCsv(text: string): any[][] {
  const lines = text.trim().split('\n');
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
        continue;
      }
      current += char;
    }

    if (current || line.endsWith(',')) {
      result.push(current);
    }

    return result;
  });
}

function parseXml(text: string): unknown {
  try {
    const parsed = JSON.parse(text);
    return jsonToXml(parsed);
  } catch {
    return `<DOCUMENT>\n${text}\n</DOCUMENT>`;
  }
}

function wrapWithMetadata<T>(
  value: StructuredValue<T>,
  extra: Record<string, unknown>
): StructuredValue<T> {
  for (const [key, data] of Object.entries(extra)) {
    Object.defineProperty(value, key, {
      value: data,
      enumerable: false,
      configurable: true
    });
  }
  return value;
}

export function buildPipelineStructuredValue(
  text: string,
  format: StructuredValueType = 'json'
): StructuredValue {
  const normalizedFormat = (format ?? 'json').toLowerCase();

  if (normalizedFormat === 'csv') {
    try {
      const data = parseCsv(text);
      return wrapWithMetadata(wrapStructured(data, 'array', text), { csv: data });
    } catch (error) {
      throw new MlldInterpreterError(
        `Failed to parse CSV: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (normalizedFormat === 'xml') {
    try {
      const data = parseXml(text);
      return wrapWithMetadata(wrapStructured(data, 'xml', text), { xml: data });
    } catch (error) {
      throw new MlldInterpreterError(
        `Failed to parse XML: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (normalizedFormat === 'text') {
    return wrapStructured(text, 'text', text);
  }

  try {
    const trimmed = typeof text === 'string' ? text.trim() : text;
    if (trimmed === '') {
      return wrapStructured('', 'text', text);
    }
    const parsed = JSON.parse(text);
    const structuredType =
      Array.isArray(parsed) ? 'array' : parsed !== null && typeof parsed === 'object' ? 'object' : typeof parsed;
    return wrapStructured(parsed, 'json', text, {
      format: 'json',
      structuredType
    });
  } catch (error) {
    throw new MlldInterpreterError(
      `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
