/**
 * sourceMapUtils.ts
 * 
 * Utility functions for working with source maps and enhancing errors with source location information.
 */

import { sourceMapService, SourceLocation } from '@core/utils/SourceMapService';
import { MeldError, MeldErrorOptions, ErrorSeverity } from '@core/errors/MeldError';
import { logger } from '@core/utils/logger';

/**
 * Extract line and column numbers from an error message
 * @param error The error to extract location from
 * @returns Location object or null if not found
 */
export function extractErrorLocation(error: Error): { line: number; column: number } | null {
  // First, check if the error message contains multiple line/column references
  // (e.g., "Directive error (embed): ... at line 29, column 2 at line 29, column 2")
  // This happens with nested errors, and we want the last (most specific) one
  const matches = [];
  const errorMsg = error.message || '';
  
  // Common patterns to extract line/column information
  const lineColPatterns = [
    /(?:at|on|in|line)\s+(?:line\s+)?(\d+)(?:,\s+column\s+|:)(\d+)/gi,  // "at line 10:20" or "line 10, column 20"
    /line\s+(\d+)(?:\s+|,\s+)(?:column|col|position|char|character)\s+(\d+)/gi,  // "line 10 column 20"
    /\[(\d+),\s*(\d+)\]/g,  // "[10, 20]"
    /\((\d+):(\d+)\)/g  // "(10:20)"
  ];
  
  // Try to find all matches in the error message
  for (const pattern of lineColPatterns) {
    let match;
    // Reset the regex to start from the beginning
    pattern.lastIndex = 0;
    
    while ((match = pattern.exec(errorMsg)) !== null) {
      if (match && match.length >= 3) {
        const line = parseInt(match[1], 10);
        const column = parseInt(match[2], 10);
        
        // Validate numbers are reasonable
        if (!isNaN(line) && !isNaN(column) && line > 0 && column >= 0) {
          matches.push({ line, column, index: match.index });
        }
      }
    }
  }
  
  // If we found multiple matches, prefer the last one (most specific)
  if (matches.length > 0) {
    // Sort by position in the string (later matches are more specific)
    matches.sort((a, b) => b.index - a.index);
    const lastMatch = matches[0];
    
    logger.debug(`Extracted location from error message: ${lastMatch.line}:${lastMatch.column} (from ${matches.length} matches)`, { 
      message: error.message,
      allMatches: matches.map(m => `${m.line}:${m.column}`)
    });
    
    return { line: lastMatch.line, column: lastMatch.column };
  }
  
  logger.debug(`Could not extract location from error message: ${error.message}`);
  return null;
}

/**
 * Extract location information from an error object
 * Tries various properties where location might be stored
 * @param error Error object to extract location from
 * @returns Location object or null if not found
 */
export function extractLocationFromErrorObject(error: any): { line: number; column: number } | null {
  // Check for standard location property patterns
  if (error.location) {
    // Parse MeldParseError style location: { start: { line, column }, end: { line, column } }
    if (error.location.start && typeof error.location.start.line === 'number' && typeof error.location.start.column === 'number') {
      logger.debug(`Extracted location from error.location.start: ${error.location.start.line}:${error.location.start.column}`);
      return { 
        line: error.location.start.line, 
        column: error.location.start.column 
      };
    }
    
    // Parse location: { line, column }
    if (typeof error.location.line === 'number' && typeof error.location.column === 'number') {
      logger.debug(`Extracted location from error.location: ${error.location.line}:${error.location.column}`);
      return { 
        line: error.location.line, 
        column: error.location.column 
      };
    }
  }
  
  // Check for LLMXML style position info
  if (error.details?.node?.position?.start) {
    const { line, column } = error.details.node.position.start;
    if (typeof line === 'number' && typeof column === 'number') {
      logger.debug(`Extracted location from error.details.node.position.start: ${line}:${column}`);
      return { line, column };
    }
  }
  
  // Check for position property directly
  if (error.position?.start) {
    const { line, column } = error.position.start;
    if (typeof line === 'number' && typeof column === 'number') {
      logger.debug(`Extracted location from error.position.start: ${line}:${column}`);
      return { line, column };
    }
  }
  
  // If no structured location found, try extracting from the message
  return extractErrorLocation(error);
}

/**
 * Enhance a MeldError with source location information
 * @param error The error to enhance
 * @param options Options for enhancement
 * @returns Enhanced error with source location information
 */
export function enhanceMeldErrorWithSourceInfo(
  error: MeldError, 
  options?: { 
    preferExistingSourceInfo?: boolean 
  }
): MeldError {
  // Extract location from error object or message
  const location = extractLocationFromErrorObject(error);
  
  // Skip enhancement if location can't be extracted
  if (!location) {
    logger.debug(`Could not enhance error: ${error.message} (no location found)`);
    return error;
  }
  
  // Try to find the original source location
  const sourceLocation = sourceMapService.findOriginalLocation(
    location.line, 
    location.column
  );
  
  // Skip if source location not found
  if (!sourceLocation) {
    logger.debug(`Could not enhance error: ${error.message} (no source mapping found for ${location.line}:${location.column})`);
    return error;
  }
  
  // If error already has a filePath and we should prefer it, don't override
  if (options?.preferExistingSourceInfo && error.filePath) {
    logger.debug(`Not enhancing error: ${error.message} (keeping existing filePath ${error.filePath})`);
    return error;
  }
  
  // Create new error options with source info
  const newOptions: MeldErrorOptions = {
    code: error.code,
    severity: error.severity,
    // Pass original details if they exist
    details: error.details ? { ...error.details } : undefined, 
    // Pass the calculated sourceLocation directly
    sourceLocation: sourceLocation,
    // filePath: sourceLocation.filePath, // REMOVED: Not used by constructor
    cause: error.cause // Correctly access cause property
  };
  
  // Create enhanced message
  const enhancedMessage = `${error.message} (in ${sourceLocation.filePath}:${sourceLocation.line})`;
  
  // Create a new error of the same type with enhanced information
  const EnhancedErrorConstructor = Object.getPrototypeOf(error).constructor;
  const enhancedError = new EnhancedErrorConstructor(enhancedMessage, newOptions);
  
  logger.debug(`Enhanced error: "${error.message}" -> "${enhancedError.message}"`, {
    originalLocation: location,
    sourceLocation: sourceLocation,
    filePath: sourceLocation.filePath
  });
  
  return enhancedError;
}

/**
 * Helper to register source file content
 * @param filePath Path to the source file
 * @param content Content of the source file
 */
export function registerSource(filePath: string, content: string): void {
  sourceMapService.registerSource(filePath, content);
}

/**
 * Helper to add source mapping
 * @param sourceFilePath Path to the source file
 * @param sourceLine Line number in the source file
 * @param sourceColumn Column number in the source file
 * @param targetLine Line number in the combined file
 * @param targetColumn Column number in the combined file
 */
export function addMapping(
  sourceFilePath: string, 
  sourceLine: number, 
  sourceColumn: number,
  targetLine: number, 
  targetColumn: number
): void {
  sourceMapService.addMapping(
    { filePath: sourceFilePath, line: sourceLine, column: sourceColumn },
    targetLine,
    targetColumn
  );
}

/**
 * Debug helper for CLI
 * @returns Debug information about all mappings
 */
export function getSourceMapDebugInfo(): string {
  return sourceMapService.getDebugInfo();
}

// Enhanced debug helper that shows more detailed mapping information
export function getDetailedSourceMapDebugInfo(): string {
  return sourceMapService.getDetailedDebugInfo();
}

/**
 * Reset all source mappings (useful for tests)
 */
export function resetSourceMaps(): void {
  sourceMapService.reset();
}