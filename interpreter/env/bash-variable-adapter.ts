/**
 * Bash Variable Adapter
 * Converts Variables with proxies/metadata to simple string values for bash/sh
 */

import type { Variable } from '@core/types/variable';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { resolveValue, ResolutionContext } from '@interpreter/utils/variable-resolution';
import type { Environment } from './Environment';
import * as fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Convert Variables to string values suitable for bash environment variables
 * This adapter allows us to use enhanced Variable passing everywhere while
 * providing bash with the simple string values it needs
 */
export async function adaptVariablesForBash(
  params: Record<string, any>,
  env: Environment
): Promise<{ envVars: Record<string, string>; tempFiles: string[] }> {
  const bashVars: Record<string, string> = {};
  const tempFiles: string[] = [];

  // Always return actual string values. Oversized values are handled by
  // BashExecutor via heredoc injection, not via temp files here.
  for (const [key, value] of Object.entries(params)) {
    const resolved = await resolveValue(value, env, ResolutionContext.CommandExecution);
    const strValue = convertToString(resolved);
    bashVars[key] = strValue;
  }

  return { envVars: bashVars, tempFiles };
}

/**
 * Convert any value to a string suitable for bash environment variable
 */
function convertToString(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (isPathLikeValue(value)) {
    return value.resolvedPath;
  }

  if (isStructuredValue(value)) {
    return asText(value);
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  if (Array.isArray(value)) {
    // For generic arrays, join with newlines (common bash pattern)
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

function isPathLikeValue(value: unknown): value is { resolvedPath: string } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.resolvedPath === 'string' &&
    typeof candidate.originalPath === 'string' &&
    typeof candidate.isURL === 'boolean' &&
    typeof candidate.isAbsolute === 'boolean'
  );
}

/**
 * Check if we need bash adaptation based on language
 */
export function needsBashAdaptation(language: string): boolean {
  return language === 'bash' || language === 'sh';
}
