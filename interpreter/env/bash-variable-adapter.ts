/**
 * Bash Variable Adapter
 * Converts Variables with proxies/metadata to simple string values for bash/sh
 * Part of Phase 5: Making enhanced Variable passing the standard
 */

import type { Variable } from '@core/types/variable';
import { isVariable, resolveVariableValueLegacy } from '@interpreter/utils/variable-resolution';
import type { Environment } from './Environment';

/**
 * Convert Variables to string values suitable for bash environment variables
 * This adapter allows us to use enhanced Variable passing everywhere while
 * providing bash with the simple string values it needs
 */
export async function adaptVariablesForBash(
  params: Record<string, any>,
  env: Environment
): Promise<Record<string, string>> {
  const bashVars: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(params)) {
    // If it's a Variable, extract its value
    if (isVariable(value)) {
      const resolved = await resolveVariableValueLegacy(value, env);
      bashVars[key] = convertToString(resolved);
    } else {
      // Already a raw value (from proxy or direct value)
      bashVars[key] = convertToString(value);
    }
  }
  
  return bashVars;
}

/**
 * Convert any value to a string suitable for bash environment variable
 */
function convertToString(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  if (Array.isArray(value)) {
    // For arrays, join with newlines (common bash pattern)
    return value.map(item => convertToString(item)).join('\n');
  }
  
  if (typeof value === 'object') {
    // For objects, use JSON representation
    try {
      return JSON.stringify(value);
    } catch {
      return '[object Object]';
    }
  }
  
  return String(value);
}

/**
 * Check if we need bash adaptation based on language
 */
export function needsBashAdaptation(language: string): boolean {
  return language === 'bash' || language === 'sh';
}