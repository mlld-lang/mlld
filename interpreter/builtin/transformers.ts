import type { MlldVariable } from '@core/types';
import type { ExecutableDefinition } from '@core/types/executable';

// Import existing utilities
import { llmxmlInstance } from '../utils/llmxml-instance';
import { formatMarkdown } from '../utils/markdown-formatter';

export interface TransformerDefinition {
  name: string;
  uppercase: string;
  description: string;
  implementation: (input: string) => Promise<string> | string;
}

export const builtinTransformers: TransformerDefinition[] = [
  {
    name: 'xml',
    uppercase: 'XML',
    description: 'Convert content to SCREAMING_SNAKE_CASE XML using llmxml',
    implementation: async (input: string) => {
      return await llmxmlInstance.toXml(input);
    }
  },
  {
    name: 'json',
    uppercase: 'JSON', 
    description: 'Format as JSON or convert to JSON structure',
    implementation: (input: string) => {
      try {
        // Try to parse and pretty-print existing JSON
        const parsed = JSON.parse(input);
        return JSON.stringify(parsed, null, 2);
      } catch {
        // Not JSON - attempt to convert markdown structures to JSON
        return convertToJSON(input);
      }
    }
  },
  {
    name: 'csv',
    uppercase: 'CSV',
    description: 'Convert to CSV format',
    implementation: (input: string) => {
      return convertToCSV(input);
    }
  },
  {
    name: 'md',
    uppercase: 'MD',
    description: 'Format markdown with prettier',
    implementation: async (input: string) => {
      return await formatMarkdown(input);
    }
  }
];

/**
 * Create an executable variable for a transformer
 */
export function createTransformerVariable(
  name: string,
  implementation: (input: string) => Promise<string> | string,
  description: string,
  isUppercase: boolean
): MlldVariable {
  const executableDef: ExecutableDefinition = {
    type: 'code',
    codeTemplate: [{ type: 'Text', content: '// Built-in transformer' }],
    language: 'javascript',
    paramNames: ['input'],
    sourceDirective: 'builtin'
  };

  return {
    type: 'executable',
    name,
    value: executableDef,
    metadata: {
      isSystem: true,
      isBuiltinTransformer: true,
      transformerImplementation: implementation,
      description,
      isUppercase
    }
  };
}

/**
 * Convert markdown structures to JSON
 */
function convertToJSON(input: string): string {
  try {
    const lines = input.split('\n');
    const result: any = {};
    let currentList: string[] | null = null;
    let currentTable: any[] | null = null;
    let tableHeaders: string[] | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Handle headers as keys
      if (trimmed.startsWith('#')) {
        const level = trimmed.match(/^#+/)?.[0].length || 1;
        const text = trimmed.replace(/^#+\s*/, '');
        if (level === 1) {
          result[text] = {};
        }
      }
      // Handle lists
      else if (trimmed.match(/^[-*]\s+/)) {
        if (!currentList) currentList = [];
        currentList.push(trimmed.replace(/^[-*]\s+/, ''));
        
        // Check if next line continues the list
        if (i === lines.length - 1 || !lines[i + 1].trim().match(/^[-*]\s+/)) {
          result.list = currentList;
          currentList = null;
        }
      }
      // Handle table headers
      else if (trimmed.includes('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
        tableHeaders = trimmed.split('|').map(h => h.trim()).filter(h => h);
        currentTable = [];
        i++; // Skip separator line
      }
      // Handle table rows
      else if (trimmed.includes('|') && tableHeaders) {
        const values = trimmed.split('|').map(v => v.trim()).filter(v => v);
        const row: any = {};
        tableHeaders.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });
        currentTable!.push(row);
        
        // Check if next line continues the table
        if (i === lines.length - 1 || !lines[i + 1].trim().includes('|')) {
          result.table = currentTable;
          currentTable = null;
          tableHeaders = null;
        }
      }
      // Handle key-value pairs
      else if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        result[key.trim()] = value;
      }
    }
    
    return JSON.stringify(result, null, 2);
  } catch (error) {
    // If conversion fails, wrap the input as a string
    return JSON.stringify({ content: input }, null, 2);
  }
}

/**
 * Convert to CSV format
 */
function convertToCSV(input: string): string {
  try {
    // First try to parse as JSON
    const data = JSON.parse(input);
    
    if (Array.isArray(data)) {
      // Array of objects - ideal for CSV
      if (data.length === 0) return '';
      
      const headers = Object.keys(data[0]);
      const rows = [
        headers.map(h => escapeCSV(h)).join(','),
        ...data.map(obj => 
          headers.map(h => escapeCSV(String(obj[h] || ''))).join(',')
        )
      ];
      return rows.join('\n');
    } else if (typeof data === 'object') {
      // Single object - create one row
      const headers = Object.keys(data);
      const values = headers.map(h => escapeCSV(String(data[h] || '')));
      return [
        headers.map(h => escapeCSV(h)).join(','),
        values.join(',')
      ].join('\n');
    } else {
      // Primitive value
      return escapeCSV(String(data));
    }
  } catch {
    // Not JSON - try to parse markdown table
    const lines = input.split('\n');
    const csvRows: string[] = [];
    let inTable = false;
    let headers: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.includes('|')) {
        if (!inTable && i + 1 < lines.length && lines[i + 1].includes('---')) {
          // Table header
          headers = line.split('|').map(h => h.trim()).filter(h => h);
          csvRows.push(headers.map(h => escapeCSV(h)).join(','));
          inTable = true;
          i++; // Skip separator
        } else if (inTable) {
          // Table row
          const values = line.split('|').map(v => v.trim()).filter(v => v);
          csvRows.push(values.map(v => escapeCSV(v)).join(','));
        }
      } else if (inTable) {
        // End of table
        inTable = false;
        headers = [];
      }
    }
    
    return csvRows.length > 0 ? csvRows.join('\n') : escapeCSV(input);
  }
}

/**
 * Escape CSV field value
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}