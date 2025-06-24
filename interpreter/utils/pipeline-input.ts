import { MlldInterpreterError } from '@core/errors';
import { llmxmlInstance } from './llmxml-instance';
import { jsonToXml } from './json-to-xml';

/**
 * Pipeline input interface that provides both raw text and parsed data
 */
export interface PipelineInput {
  text: string;
  type: string;
  // Lazy-loaded parsed data based on format
  readonly data?: any;
  readonly csv?: any[][];
  readonly xml?: any;
}

/**
 * Parse CSV text into a 2D array
 * Simple implementation - can be enhanced later
 */
function parseCSV(text: string): any[][] {
  const lines = text.trim().split('\n');
  return lines.map(line => {
    // Simple CSV parsing - handle quoted values
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add last field
    if (current || line.endsWith(',')) {
      result.push(current);
    }
    
    return result;
  });
}

/**
 * Parse XML text using our internal XML handling
 * This is a simplified synchronous version for pipeline compatibility
 * TODO: Add support for async parsing in the future
 */
function parseXML(text: string): any {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(text);
    // Use our JSON to XML converter for structured data
    return jsonToXml(parsed);
  } catch {
    // For non-JSON text, we can't use llmxml synchronously
    // So we'll just wrap in DOCUMENT tags for now
    // TODO: Support async XML parsing in pipelines
    return `<DOCUMENT>\n${text}\n</DOCUMENT>`;
  }
}

/**
 * Create a pipeline input wrapper with lazy parsing
 */
export function createPipelineInput(text: string, format: string = 'json'): PipelineInput {
  const input: any = {
    text,
    type: format,
    _parsed: undefined
  };

  // Define lazy getters based on format
  switch (format.toLowerCase()) {
    case 'json':
    default:
      Object.defineProperty(input, 'data', {
        get() {
          if (this._parsed === undefined) {
            try {
              if (process.env.MLLD_DEBUG === 'true') {
                console.log('Parsing JSON from text:', this.text);
                console.log('Text length:', this.text.length);
              }
              this._parsed = JSON.parse(this.text);
            } catch (e: any) {
              if (process.env.MLLD_DEBUG === 'true') {
                console.error('Failed to parse JSON. Text was:', this.text);
                console.error('First 100 chars:', this.text.substring(0, 100));
              }
              throw new MlldInterpreterError(`Failed to parse JSON: ${e.message}`);
            }
          }
          return this._parsed;
        },
        enumerable: true,
        configurable: true
      });
      break;

    case 'csv':
      Object.defineProperty(input, 'csv', {
        get() {
          if (this._parsed === undefined) {
            try {
              this._parsed = parseCSV(this.text);
            } catch (e: any) {
              throw new MlldInterpreterError(`Failed to parse CSV: ${e.message}`);
            }
          }
          return this._parsed;
        },
        enumerable: true,
        configurable: true
      });
      break;

    case 'xml':
      Object.defineProperty(input, 'xml', {
        get() {
          if (this._parsed === undefined) {
            try {
              this._parsed = parseXML(this.text);
            } catch (e: any) {
              throw new MlldInterpreterError(`Failed to parse XML: ${e.message}`);
            }
          }
          return this._parsed;
        },
        enumerable: true,
        configurable: true
      });
      break;

    case 'text':
      // No special parsing for text format
      // The data property just returns the raw text
      Object.defineProperty(input, 'data', {
        get() {
          return this.text;
        },
        enumerable: true,
        configurable: true
      });
      break;
  }

  return input;
}

/**
 * Check if a value is already a PipelineInput
 */
export function isPipelineInput(value: any): value is PipelineInput {
  return value && 
         typeof value === 'object' && 
         'text' in value && 
         'type' in value &&
         typeof value.text === 'string' &&
         typeof value.type === 'string';
}