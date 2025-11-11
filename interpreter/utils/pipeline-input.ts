import { MlldInterpreterError } from '@core/errors';
import { llmxmlInstance } from './llmxml-instance';
import { jsonToXml } from './json-to-xml';
import type { StructuredValue, StructuredValueType } from './structured-value';
import { STRUCTURED_VALUE_SYMBOL, attachContextToStructuredValue } from './structured-value';

export interface PipelineInput<T = unknown> extends StructuredValue<T> {
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
export function createPipelineInput<T = unknown>(
  text: string,
  format: StructuredValueType = 'json'
): PipelineInput<T> {
  if (process.env.MLLD_DEBUG === 'true') {
    console.error('createPipelineInput called with:', {
      textType: typeof text,
      textLength: typeof text === 'string' ? text.length : 'N/A',
      format: format,
      textPreview: typeof text === 'string' ? text.substring(0, 50) : String(text)
    });
  }
  
  const input: any = {
    text: String(text), // Ensure it's a string
    type: format,
    _parsed: undefined
  };

  Object.defineProperty(input, STRUCTURED_VALUE_SYMBOL, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });

  // Define lazy getters based on format
  switch (format.toLowerCase()) {
    case 'json':
    default:
      Object.defineProperty(input, 'data', {
        get() {
          if (this._parsed === undefined) {
            try {
              if (process.env.MLLD_DEBUG === 'true') {
                console.error('JSON getter called');
                console.error('this:', this);
                console.error('this.text exists:', 'text' in this);
                console.error('this.text value:', this.text);
                console.error('Text type:', typeof this.text);
                if (this.text) {
                  console.error('Text length:', this.text.length);
                  console.error('First 200 chars:', this.text.substring(0, 200));
                }
              }
              
              if (!this.text) {
                throw new Error('PipelineInput.text is undefined or null');
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
      Object.defineProperty(input, 'data', {
        get() {
          return this.csv;
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
      Object.defineProperty(input, 'data', {
        get() {
          return this.xml;
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

  // Add toString() for backwards compatibility
  Object.defineProperty(input, 'toString', {
    value: function() {
      if (process.env.MLLD_DEBUG === 'true') {
        console.log('PipelineInput.toString() called - returning text property');
        console.trace('toString call stack');
      }
      return this.text;
    },
    enumerable: false,
    configurable: true
  });

  Object.defineProperty(input, 'valueOf', {
    value: function() {
      return this.text;
    },
    enumerable: false,
    configurable: true
  });

  Object.defineProperty(input, Symbol.toPrimitive, {
    value: function() {
      return this.text;
    },
    enumerable: false,
    configurable: true
  });

  return attachContextToStructuredValue(input) as PipelineInput<T>;
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
