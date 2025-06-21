import { MlldInterpreterError } from '@core/errors';

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
 * Parse XML text - placeholder for now
 * TODO: Integrate with llmxml or similar
 */
function parseXML(text: string): any {
  // For now, just return a placeholder object
  // In the future, this should use a proper XML parser
  return {
    _raw: text,
    _parsed: false,
    // Placeholder structure
    root: null
  };
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
              this._parsed = JSON.parse(this.text);
            } catch (e: any) {
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