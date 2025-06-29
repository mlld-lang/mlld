/**
 * Pattern Registry
 * 
 * This file statically imports all error patterns to avoid dynamic import issues
 * with TypeScript path aliases at runtime.
 */

import type { ErrorPattern } from './types';

// Import all patterns statically
import { pattern as directiveUnknown } from '../../../errors/cases/parse/directive-unknown/pattern';
import { pattern as importWildcard } from '../../../errors/cases/parse/import-wildcard/pattern';
import { pattern as runMissingBraces } from '../../../errors/cases/parse/run-missing-braces/pattern';

// Export all patterns as an array
export const errorPatterns: ErrorPattern[] = [
  directiveUnknown,
  importWildcard,
  runMissingBraces,
];

// Export a map for easier access by name
export const errorPatternMap = new Map<string, ErrorPattern>(
  errorPatterns.map(p => [p.name, p])
);