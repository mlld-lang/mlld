/**
 * Bash Variable Adapter
 * Converts Variables with proxies/metadata to simple string values for bash/sh
 */

import type { Variable } from '@core/types/variable';
import { resolveValue, ResolutionContext } from '@interpreter/utils/variable-resolution';
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
    // Resolve the value - will extract if it's a Variable, pass through if not
    const resolved = await resolveValue(value, env, ResolutionContext.CommandExecution);
    bashVars[key] = convertToString(resolved);
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