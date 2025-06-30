import { loadErrorPatterns } from './loader';
import { ErrorPatternMatcher } from './matcher';
import { MlldParseError } from '@core/errors';
import type { PeggyError } from './types';

let patternMatcher: ErrorPatternMatcher | null = null;
let initialized = false;

/**
 * Initialize the error pattern system
 * This should be called once at startup
 */
export async function initializePatterns(): Promise<void> {
  if (initialized) return;
  
  try {
    const patterns = await loadErrorPatterns();
    patternMatcher = new ErrorPatternMatcher(patterns);
    initialized = true;
    
    // Only log in development
    if (process.env.NODE_ENV === 'development' || process.env.MLLD_DEBUG === 'true') {
      console.log(`Loaded ${patterns.length} error patterns`);
    }
  } catch (error) {
    // Silently continue without patterns in production
    if (process.env.NODE_ENV === 'development' || process.env.MLLD_DEBUG === 'true') {
      console.warn('Failed to load error patterns:', error);
    }
    // Create empty matcher as fallback
    patternMatcher = new ErrorPatternMatcher([]);
    initialized = true;
  }
}

/**
 * Get the initialized pattern matcher
 * Returns null if not initialized
 */
export function getPatternMatcher(): ErrorPatternMatcher | null {
  return patternMatcher;
}

/**
 * Enhance a parse error using patterns
 * Returns enhanced error or null if no pattern matches
 */
export async function enhanceParseError(
  error: PeggyError,
  source: string,
  filePath?: string
): Promise<MlldParseError | null> {
  // Ensure patterns are initialized
  if (!initialized) {
    await initializePatterns();
  }
  
  if (!patternMatcher) {
    return null;
  }
  
  // Handle our custom mlldError which has mlldErrorLocation instead of location
  if ((error as any).isMlldError && (error as any).mlldErrorLocation) {
    const mlldError = error as any;
    // Copy mlldErrorLocation to location so the pattern matcher can use it
    error.location = mlldError.mlldErrorLocation;
  }
  
  // matcher.enhance always returns an error (with fallback)
  // but we can return it as potentially null for future flexibility
  return patternMatcher.enhance(error, source, filePath) as MlldParseError;
}