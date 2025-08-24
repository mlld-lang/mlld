/**
 * Utilities for automatically detecting and parsing JSON output from commands
 * 
 * This helps improve the developer experience by automatically parsing JSON
 * strings into objects/arrays when commands return valid JSON.
 */

export interface JsonParseResult {
  /** Whether the input was successfully parsed as JSON */
  isJson: boolean;
  /** The parsed value (if JSON) or original value (if not JSON) */
  value: any;
  /** The original string value */
  originalValue: string;
}

/**
 * Detects if a string contains valid JSON and attempts to parse it
 * 
 * @param value - The string value to check and potentially parse
 * @returns JsonParseResult with parsing information
 */
export function tryParseJson(value: string): JsonParseResult {
  const trimmed = value.trim();
  
  // Quick heuristic checks to avoid expensive JSON.parse calls
  // on obvious non-JSON strings
  if (!trimmed) {
    return { isJson: false, value: trimmed, originalValue: value };
  }
  
  // Check if it looks like JSON (starts with { [ " or is a primitive)
  const firstChar = trimmed[0];
  const lastChar = trimmed[trimmed.length - 1];
  
  const looksLikeJson = 
    // Object: starts with { and ends with }
    (firstChar === '{' && lastChar === '}') ||
    // Array: starts with [ and ends with ]
    (firstChar === '[' && lastChar === ']') ||
    // String: starts and ends with quotes
    (firstChar === '"' && lastChar === '"') ||
    // Primitive values
    trimmed === 'true' ||
    trimmed === 'false' ||
    trimmed === 'null' ||
    // Number (simple check)
    /^-?\d+\.?\d*$/.test(trimmed);
  
  if (!looksLikeJson) {
    return { isJson: false, value: trimmed, originalValue: value };
  }
  
  try {
    const parsed = JSON.parse(trimmed);
    return { isJson: true, value: parsed, originalValue: value };
  } catch (error) {
    // Not valid JSON, return original
    return { isJson: false, value: trimmed, originalValue: value };
  }
}

/**
 * Checks if automatic JSON parsing should be enabled
 * 
 * This can be controlled via:
 * 1. Environment variable MLLD_AUTO_PARSE_JSON (true/false)
 * 2. Configuration option (future)
 * 
 * @returns true if auto-parsing should be enabled
 */
export function shouldAutoParseJson(): boolean {
  const envVar = process.env.MLLD_AUTO_PARSE_JSON;
  
  // Default to true (enabled) unless explicitly disabled
  if (envVar !== undefined) {
    return envVar.toLowerCase() === 'true';
  }
  
  return true; // Default enabled
}

/**
 * Processes command output with optional JSON auto-parsing
 * 
 * @param output - The raw command output
 * @param enableAutoParse - Whether to attempt JSON parsing (defaults to shouldAutoParseJson())
 * @returns The processed output (parsed JSON object/array or original string)
 */
export function processCommandOutput(output: string, enableAutoParse?: boolean): any {
  const shouldParse = enableAutoParse ?? shouldAutoParseJson();
  
  if (!shouldParse) {
    return output;
  }
  
  const result = tryParseJson(output);
  return result.value;
}
