import JSON5 from 'json5';

import type { MlldVariable } from '@core/types';
import type { ExecutableDefinition } from '@core/types/executable';

// Import existing utilities
import { llmxmlInstance } from '../utils/llmxml-instance';
import { normalizeOutput } from '../output/normalizer';
import { jsonToXml } from '../utils/json-to-xml';

export interface TransformerDefinition {
  name: string;
  uppercase: string;
  description: string;
  implementation: (input: any) => Promise<any> | any;
  variants?: TransformerVariant[];
  /** If true, the name is reserved and cannot be overridden by user code */
  isReserved?: boolean;
}

export interface TransformerVariant {
  field: string;
  description: string;
  implementation: (input: any) => Promise<any> | any;
}

function makeJsonTransformer(mode: 'loose' | 'strict' | 'llm') {
  return (input: string) => {
    if (mode === 'llm') {
      const extracted = extractJsonFromLLMResponse(input);
      if (!extracted) {
        return false;
      }

      try {
        return JSON5.parse(extracted);
      } catch {
        return false;
      }
    }

    if (mode === 'strict') {
      try {
        return JSON.parse(input);
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        // Check if input looks like markdown-fenced JSON
        const trimmed = input.trim();
        if (trimmed.startsWith('```json') || trimmed.startsWith('```\n{') || trimmed.startsWith('```\n[')) {
          throw new Error(`Strict JSON parsing failed - input appears to be wrapped in markdown code fences. Use @json.llm to extract JSON from LLM responses.\n\n${details}`);
        }
        throw new Error(`Strict JSON parsing failed (use @json.loose for relaxed syntax)\n\n${details}`);
      }
    }

    if (mode === 'loose') {
      try {
        return JSON5.parse(input);
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        // Check if input looks like markdown-fenced JSON
        const trimmed = input.trim();
        if (trimmed.startsWith('```json') || trimmed.startsWith('```\n{') || trimmed.startsWith('```\n[')) {
          throw new Error(`JSON parsing failed - input appears to be wrapped in markdown code fences. Use @json.llm to extract JSON from LLM responses.\n\n${details}`);
        }
        throw new Error(`JSON parsing failed (use @json.llm for LLM responses with code fences)\n\n${details}`);
      }
    }

    // This shouldn't be reached, but fallback to strict parsing
    return JSON.parse(input);
  };
}

/**
 * Extract JSON from LLM-generated responses
 * Handles code fences, inline JSON, and surrounding prose
 * @param input String that may contain JSON
 * @returns Extracted JSON string or null if no JSON found
 */
function extractJsonFromLLMResponse(input: string): string | null {
  const trimmed = input.trim();

  // Strategy 1: Extract from markdown code fences
  const fencePatterns = [
    /```json\s*\n([\s\S]*?)\n```/,     // ```json\n...\n```
    /```\s*\n([\s\S]*?)\n```/,          // ```\n...\n```
  ];

  for (const pattern of fencePatterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (looksLikeJson(candidate)) {
        return candidate;
      }
    }
  }

  // Strategy 2: Find JSON object/array in prose
  const jsonPatterns = [
    /\{[\s\S]*\}/,  // Find {...}
    /\[[\s\S]*\]/,  // Find [...]
  ];

  for (const pattern of jsonPatterns) {
    const match = trimmed.match(pattern);
    if (match && match[0]) {
      const candidate = match[0].trim();
      if (looksLikeJson(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Quick heuristic to validate JSON-like structure
 * Not a full parser - just filters obvious non-JSON
 * @param str Potential JSON string
 * @returns true if string looks like valid JSON structure
 */
function looksLikeJson(str: string): boolean {
  const startsRight = str.startsWith('{') || str.startsWith('[');
  const endsRight = str.endsWith('}') || str.endsWith(']');
  const hasStructure = str.includes(':') || str.includes(',');
  const minLength = str.length > 2;

  return startsRight && endsRight && hasStructure && minLength;
}


export const builtinTransformers: TransformerDefinition[] = [
  {
    name: 'typeof',
    uppercase: 'TYPEOF',
    description: 'Get type information for a variable',
    isReserved: true,
    implementation: async (input: string) => {
      // The input will be a special marker when we have a Variable object
      // Otherwise it's just the string value
      if (input.startsWith('__MLLD_VARIABLE_OBJECT__:')) {
        // This is handled specially in exec-invocation.ts
        return input.substring('__MLLD_VARIABLE_OBJECT__:'.length);
      }
      // Fallback: analyze the value itself
      return analyzeValueType(input);
    }
  },
  {
    name: 'exists',
    uppercase: 'EXISTS',
    description: 'Return true when an expression evaluates without error',
    isReserved: true,
    implementation: async (input: string) => {
      return input.trim().length > 0;
    }
  },
  {
    name: 'xml',
    uppercase: 'XML',
    description: 'Convert content to SCREAMING_SNAKE_CASE XML',
    isReserved: true,
    implementation: async (input: string) => {
      try {
        // Try to parse as JSON first
        const parsed = JSON.parse(input);
        // Use our JSON to XML converter
        return jsonToXml(parsed);
      } catch {
        // Not JSON - try llmxml for markdown conversion
        const result = await llmxmlInstance.toXML(input);

        // If llmxml returned the input unchanged (no conversion happened)
        if (result === input) {
          // Wrap plain text in DOCUMENT tags
          return `<DOCUMENT>\n${input}\n</DOCUMENT>`;
        }

        return result;
      }
    }
  },
  {
    name: 'json',
    uppercase: 'JSON',
    description: 'Parse JSON (supports loose JSON5 syntax)',
    isReserved: true,
    implementation: makeJsonTransformer('loose'),
    variants: [
      {
        field: 'loose',
        description: 'Parse relaxed JSON syntax (JSON5)',
        implementation: makeJsonTransformer('loose')
      },
      {
        field: 'strict',
        description: 'Parse strict JSON syntax only',
        implementation: makeJsonTransformer('strict')
      },
      {
        field: 'llm',
        description: 'Extract JSON from LLM responses (code fences, prose). Returns false if no JSON found.',
        implementation: makeJsonTransformer('llm')
      },
      {
        field: 'fromlist',
        description: 'Convert plain text list (one item per line) to JSON array',
        implementation: (input: string) => {
          return input
            .split('\n')
            .map(line => line.trimEnd())
            .filter(line => line.length > 0);
        }
      }
    ]
  },
  {
    name: 'csv',
    uppercase: 'CSV',
    description: 'Convert to CSV format',
    isReserved: true,
    implementation: (input: string) => {
      return convertToCSV(input);
    }
  },
  {
    name: 'md',
    uppercase: 'MD',
    description: 'Normalize markdown output',
    isReserved: true,
    implementation: async (input: string) => {
      return normalizeOutput(input);
    }
  },
  {
    name: 'upper',
    uppercase: 'UPPER',
    description: 'Convert text to uppercase',
    implementation: (input: string) => {
      return String(input).toUpperCase();
    }
  },
  {
    name: 'lower',
    uppercase: 'LOWER',
    description: 'Convert text to lowercase',
    implementation: (input: string) => {
      return String(input).toLowerCase();
    }
  },
  {
    name: 'trim',
    uppercase: 'TRIM',
    description: 'Remove leading and trailing whitespace',
    implementation: (input: string) => {
      return String(input).trim();
    }
  },
  {
    name: 'pretty',
    uppercase: 'PRETTY',
    description: 'Pretty-print JSON with indentation',
    implementation: (input: string) => {
      try {
        const parsed = JSON.parse(input);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return input;
      }
    }
  },
  {
    name: 'sort',
    uppercase: 'SORT',
    description: 'Sort array elements or object keys alphabetically',
    implementation: (input: string) => {
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          return JSON.stringify(parsed.sort());
        } else if (typeof parsed === 'object' && parsed !== null) {
          const sorted: Record<string, unknown> = {};
          Object.keys(parsed).sort().forEach(key => {
            sorted[key] = parsed[key];
          });
          return JSON.stringify(sorted, null, 2);
        }
        return input;
      } catch {
        // For plain text, sort lines
        return input.split('\n').sort().join('\n');
      }
    }
  }
];

/**
 * Create an executable variable for a transformer
 */
export function createTransformerVariable(
  name: string,
  implementation: (input: any) => Promise<any> | any,
  description: string,
  isUppercase: boolean
): MlldVariable {
  const executableDef: ExecutableDefinition = {
    type: 'code',
    codeTemplate: [{ type: 'Text', content: '// Built-in transformer' }],
    language: 'javascript',
    paramNames: ['input'],
    sourceDirective: 'exec'
  };

  return {
    type: 'executable',
    name,
    value: {
      ...executableDef,
      template: executableDef.codeTemplate
    },
    metadata: {
      isSystem: true,
      isBuiltinTransformer: true,
      transformerImplementation: implementation,
      description,
      isUppercase,
      executableDef
    },
    internal: {
      executableDef,
      isBuiltinTransformer: true,
      isSystem: true,
      transformerImplementation: implementation,
      transformerVariants: undefined,
      description,
      isUppercase
    }
  };
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

/**
 * Analyze the type of a value when we don't have Variable metadata
 */
function analyzeValueType(value: string): string {
  // Try to parse as JSON to detect objects/arrays
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return `array (${parsed.length} items)`;
    } else if (parsed === null) {
      return 'primitive (null)';
    } else if (typeof parsed === 'object') {
      const keys = Object.keys(parsed);
      return `object (${keys.length} properties)`;
    } else if (typeof parsed === 'boolean') {
      return 'primitive (boolean)';
    } else if (typeof parsed === 'number') {
      return 'primitive (number)';
    }
  } catch {
    // Not JSON - it's a string
  }
  
  // Check if it looks like a path
  if (value.includes('/') || value.includes('\\')) {
    return 'path';
  }
  
  // Default to simple-text
  return 'simple-text';
}
