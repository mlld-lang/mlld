import { ErrorPattern, PeggyError } from './types';
import { createErrorContext } from './context';
import { MlldParseError, ErrorSeverity } from '@core/errors';

export class ErrorPatternMatcher {
  private patterns: ErrorPattern[] = [];
  
  constructor(patterns: ErrorPattern[]) {
    this.patterns = patterns;
  }
  
  /**
   * Try to match error against patterns and enhance it
   */
  enhance(error: PeggyError, source: string, filePath?: string): MlldParseError {
    const context = createErrorContext(error, source);
    
    // Try each pattern
    for (const pattern of this.patterns) {
      try {
        if (pattern.test(error, context)) {
          const enhanced = pattern.enhance(error, context);
          // Add file path if provided
          if (filePath && enhanced.location) {
            enhanced.location.filePath = filePath;
          }
          return enhanced;
        }
      } catch (e) {
        console.warn(`Pattern '${pattern.name}' threw error:`, e);
      }
    }
    
    // No pattern matched, return a simplified fallback
    return this.simplifyPeggyError(error, filePath);
  }
  
  /**
   * Fallback enhancement for unmatched errors
   */
  private simplifyPeggyError(error: PeggyError, filePath?: string): MlldParseError {
    // Instead of listing all expectations, group them intelligently
    const expectations = error.expected || [];
    const hasDirectives = expectations.some(e => e.text?.startsWith('/'));
    const hasVariables = expectations.some(e => e.text?.includes('@'));
    
    let message = error.message;
    
    // Try to simplify common error patterns
    if (hasDirectives && expectations.length > 5) {
      message = `Syntax error: Expected a directive or content`;
    } else if (hasVariables && expectations.length > 3) {
      message = `Syntax error: Invalid variable syntax`;
    } else if (expectations.length > 10) {
      // Too many expectations, just give a generic message
      message = `Syntax error at this location`;
    }
    
    // Add what was found if it's helpful
    if (error.found && error.found.length < 20) {
      message += `, but found "${error.found}"`;
    }
    
    const location = error.location;
    if (location && filePath) {
      location.filePath = filePath;
    }
    
    return new MlldParseError(
      message,
      location,
      {
        severity: ErrorSeverity.Fatal,
        cause: error,
        filePath: filePath
      }
    );
  }
}