/**
 * Built-in transformer detection and metadata
 * 
 * This module defines which transformers are built into mlld
 * and don't require explicit /exe definitions.
 */

/**
 * List of built-in transformer names
 */
const BUILTIN_TRANSFORMERS = new Set([
  // Format converters
  'json',
  'json.loose',
  'json.strict',
  'json.llm',
  'json.fromlist',
  'JSON',
  'JSON_LOOSE',
  'JSON_STRICT',
  'JSON_LLM',
  'JSON_FROMLIST',
  'xml',
  'XML',
  'csv',
  'CSV',
  'md',
  'MD',

  // String transformations
  'upper',
  'UPPER',
  'lower',
  'LOWER',
  'trim',
  'TRIM',

  // These might be built-in (need to verify)
  'pretty',
  'PRETTY',
  'sort',
  'SORT'
]);

/**
 * Check if a transformer name is a built-in
 */
export function isBuiltinTransformer(name: string): boolean {
  return BUILTIN_TRANSFORMERS.has(name);
}

/**
 * Get list of all built-in transformers for error messages
 */
export function getBuiltinTransformers(): string[] {
  // Return lowercase versions for display
  return Array.from(new Set(
    Array.from(BUILTIN_TRANSFORMERS).map(t => t.toLowerCase())
  )).sort();
}
