import { errorPatterns } from './registry';
import type { ErrorPattern } from './types';

/**
 * Load all error patterns from the static registry
 * This avoids dynamic import issues with TypeScript path aliases
 */
export async function loadErrorPatterns(): Promise<ErrorPattern[]> {
  // Simply return the statically imported patterns
  return errorPatterns;
}