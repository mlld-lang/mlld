/**
 * Utilities for automatically detecting and parsing JSON output from commands
 *
 * This helps improve the developer experience by automatically parsing JSON
 * strings into objects/arrays when commands return valid JSON.
 */
import type {
  StructuredValue,
  StructuredValueMetadata,
  StructuredValueType
} from '@interpreter/utils/structured-value';
import { isStructuredValue, wrapStructured } from '@interpreter/utils/structured-value';

export interface JsonParseResult {
  /** Whether the input was successfully parsed as JSON */
  isJson: boolean;
  /** The parsed value (if JSON) or original value (if not JSON) */
  value: any;
  /** The original string value */
  originalValue: string;
}

export interface CommandOutputMetadata {
  source?: string;
  command?: string;
  exitCode?: number;
  duration?: number;
  stderr?: string;
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

  // Prevent auto-parsing integers that exceed Number's safe range
  const integerPattern = /^-?\d+$/;
  if (integerPattern.test(trimmed)) {
    const parsedInt = Number(trimmed);
    if (!Number.isSafeInteger(parsedInt)) {
      return { isJson: false, value: trimmed, originalValue: value };
    }
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

function inferStructuredType(value: unknown): StructuredValueType {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null' as StructuredValueType;
  }
  if (typeof value === 'object') {
    return 'object';
  }
  if (typeof value === 'number') {
    return 'number' as StructuredValueType;
  }
  if (typeof value === 'boolean') {
    return 'boolean' as StructuredValueType;
  }
  return 'text';
}

function normalizeCommandOutput(
  output: unknown
): { value: unknown; text: string; metadata?: CommandOutputMetadata } {
  if (isStructuredValue(output)) {
    return {
      value: output,
      text: output.text,
      metadata: output.metadata as CommandOutputMetadata | undefined
    };
  }

  if (typeof output === 'string') {
    return { value: output, text: output };
  }

  if (output === null || output === undefined) {
    return { value: '', text: '' };
  }

  if (typeof output === 'object') {
    const candidate = output as Record<string, unknown>;
    const stdout = typeof candidate.stdout === 'string'
      ? candidate.stdout
      : typeof candidate.output === 'string'
        ? candidate.output
        : undefined;
    const text = stdout ?? String(output);
    const metadata: CommandOutputMetadata = {
      source: typeof candidate.source === 'string' ? candidate.source : undefined,
      command: typeof candidate.command === 'string' ? candidate.command : undefined,
      exitCode: typeof candidate.exitCode === 'number' ? candidate.exitCode : undefined,
      duration: typeof candidate.duration === 'number'
        ? candidate.duration
        : typeof candidate.durationMs === 'number'
          ? candidate.durationMs
          : undefined,
      stderr: typeof candidate.stderr === 'string' ? candidate.stderr : undefined
    };

    if (Object.values(metadata).some(value => value !== undefined)) {
      return { value: output, text, metadata };
    }

    return { value: output, text };
  }

  return { value: output, text: String(output) };
}

function mergeCommandMetadata(
  normalized: CommandOutputMetadata | undefined,
  override: CommandOutputMetadata | undefined
): StructuredValueMetadata | undefined {
  const merged: StructuredValueMetadata = {
    source: override?.source ?? normalized?.source ?? 'cmd',
    command: override?.command ?? normalized?.command,
    exitCode: override?.exitCode ?? normalized?.exitCode,
    duration: override?.duration ?? normalized?.duration,
    stderr: override?.stderr ?? normalized?.stderr
  };

  if (Object.values(merged).every(value => value === undefined)) {
    return undefined;
  }

  return merged;
}

/**
 * Processes command output with optional JSON auto-parsing
 *
 * @param output - The raw command output
 * @param enableAutoParse - Whether to attempt JSON parsing (defaults to shouldAutoParseJson())
 * @returns StructuredValue with raw text and parsed data views
 */
export function processCommandOutput(
  output: unknown,
  enableAutoParse?: boolean,
  metadata?: CommandOutputMetadata
): StructuredValue {
  const shouldParse = enableAutoParse ?? shouldAutoParseJson();
  const normalized = normalizeCommandOutput(output);
  const mergedMetadata = mergeCommandMetadata(normalized.metadata, metadata);

  if (isStructuredValue(normalized.value)) {
    return wrapStructured(
      normalized.value,
      normalized.value.type,
      normalized.value.text,
      mergedMetadata
    );
  }

  if (!shouldParse) {
    return wrapStructured(normalized.text, 'text', normalized.text, mergedMetadata);
  }

  const result = tryParseJson(normalized.text);
  const parsedValue = result.isJson ? result.value : normalized.text;
  const parsedType = result.isJson ? inferStructuredType(result.value) : 'text';
  return wrapStructured(parsedValue, parsedType, normalized.text, mergedMetadata);
}
