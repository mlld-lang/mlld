/**
 * Shared retry utilities for both pipeline and standalone execution
 */

import type { UniversalContext } from '@core/universal-context';

/**
 * Check if a value is a retry signal
 */
export function isRetrySignal(value: any): boolean {
  // Direct retry values
  if (value === 'retry') return true;
  
  // Object with retry flag
  if (value && typeof value === 'object') {
    if (value.value === 'retry' || value.retry === true || value.__retry === true) {
      return true;
    }
  }
  
  // Stringified JSON retry signal
  if (typeof value === 'string' && value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && (parsed.retry === true || parsed.__retry === true)) {
        return true;
      }
    } catch {
      // Not valid JSON
    }
  }
  
  return false;
}

/**
 * Extract hint from retry signal
 */
export function extractRetryHint(value: any): any {
  if (!value || typeof value !== 'object') return null;
  
  // Direct hint property
  if ('hint' in value) return value.hint;
  
  // Nested in value
  if (value.value && typeof value.value === 'object' && 'hint' in value.value) {
    return value.value.hint;
  }
  
  // Try parsing stringified JSON
  if (typeof value === 'string' && value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && 'hint' in parsed) return parsed.hint;
    } catch {
      // Not valid JSON
    }
  }
  
  return null;
}

/**
 * Create updated context for retry attempt
 */
export function createRetryContext(
  currentContext: UniversalContext,
  attempt: number,
  hint: any,
  lastOutput: any,
  tries: Array<any>
): UniversalContext {
  return {
    ...currentContext,
    try: attempt,
    hint: hint,
    lastOutput: lastOutput,
    tries: tries
  };
}

/**
 * Record a retry attempt in the tries array
 */
export function recordRetryAttempt(
  tries: Array<any>,
  attempt: number,
  result: 'retry' | 'success' | 'error',
  hint?: any,
  output?: any
): void {
  tries.push({
    attempt,
    result,
    hint,
    output
  });
}

/**
 * Maximum retry attempts (can be overridden via environment variable)
 */
export const MAX_RETRIES = process.env.MLLD_MAX_RETRIES 
  ? parseInt(process.env.MLLD_MAX_RETRIES, 10) 
  : 10;