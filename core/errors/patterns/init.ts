import { enhanceParseError as enhanceParseErrorImpl } from './parse-errors.generated.js';
import { MlldParseError } from '@core/errors';
import type { PeggyError } from './types';

/**
 * Initialize the error pattern system
 * This is now a no-op since patterns are compiled
 */
export async function initializePatterns(): Promise<void> {
  // No-op - patterns are now compiled at build time
}

/**
 * Enhance a parse error using patterns
 * Returns enhanced error
 */
export async function enhanceParseError(
  error: PeggyError,
  source: string,
  filePath?: string
): Promise<MlldParseError | null> {
  // Handle our custom mlldError which has mlldErrorLocation instead of location
  if ((error as any).isMlldError && (error as any).mlldErrorLocation) {
    const mlldError = error as any;
    // Copy mlldErrorLocation to location so the pattern matcher can use it
    error.location = mlldError.mlldErrorLocation;
  }
  
  // Use the compiled enhancer - it always returns an error (never null)
  return enhanceParseErrorImpl(error, source, filePath);
}