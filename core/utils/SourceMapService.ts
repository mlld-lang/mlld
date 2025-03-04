/**
 * SourceMapService.ts
 * 
 * This service tracks the original source locations of content in imported and embedded files,
 * enabling better error reporting by mapping error locations back to their original source.
 */

import { logger } from './logger.js';

export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
}

/**
 * Service for tracking and resolving source maps between original and combined files
 */
export class SourceMapService {
  private sources = new Map<string, string[]>();
  private mappings: Array<{
    source: SourceLocation;
    combined: { line: number; column: number };
  }> = [];
  
  /**
   * Register a source file and its content
   * @param filePath Path to the source file
   * @param content Content of the source file
   */
  registerSource(filePath: string, content: string): void {
    this.sources.set(filePath, content.split('\n'));
    logger.debug(`Registered source file for mapping: ${filePath}`);
  }
  
  /**
   * Add a mapping from a source location to a location in the combined file
   * @param source Source location information
   * @param combinedLine Line number in the combined file
   * @param combinedColumn Column number in the combined file
   */
  addMapping(source: SourceLocation, combinedLine: number, combinedColumn: number): void {
    this.mappings.push({
      source,
      combined: { line: combinedLine, column: combinedColumn }
    });
    
    logger.debug(`Added source mapping: ${source.filePath}:${source.line}:${source.column} -> ${combinedLine}:${combinedColumn}`);
  }
  
  /**
   * Find the original source location for a given location in the combined content
   * @param combinedLine Line number in the combined file
   * @param combinedColumn Column number in the combined file
   * @returns Original source location or null if not found
   */
  findOriginalLocation(combinedLine: number, combinedColumn: number): SourceLocation | null {
    // First, look for an exact line match (most accurate)
    const exactLineMatches = this.mappings.filter(mapping => 
      mapping.combined.line === combinedLine
    );
    
    if (exactLineMatches.length > 0) {
      // Find the best column match for this line
      let bestMapping = exactLineMatches[0];
      let bestColumnDistance = Math.abs(exactLineMatches[0].combined.column - combinedColumn);
      
      for (const mapping of exactLineMatches) {
        const distance = Math.abs(mapping.combined.column - combinedColumn);
        if (distance < bestColumnDistance) {
          bestColumnDistance = distance;
          bestMapping = mapping;
        }
      }
      
      // Calculate original column by adding the column offset
      const originalColumn = bestMapping.source.column + (combinedColumn - bestMapping.combined.column);
      
      const result = {
        filePath: bestMapping.source.filePath,
        line: bestMapping.source.line,
        column: Math.max(1, originalColumn) // Ensure column is at least 1
      };
      
      logger.debug(`Exact line match: ${combinedLine}:${combinedColumn} -> ${result.filePath}:${result.line}:${result.column}`);
      return result;
    }
    
    // If no exact match, find the closest mapping that's less than or equal to the target line
    // This handles cases where we're in the middle of a block of embedded content
    let bestMapping = null;
    let bestDistance = Infinity;
    
    // Try to find mappings within a reasonable range (within 10 lines)
    const MAX_LINE_DISTANCE = 10;
    
    for (const mapping of this.mappings) {
      if (mapping.combined.line <= combinedLine) {
        const distance = combinedLine - mapping.combined.line;
        
        // Only consider mappings that are within a reasonable range
        if (distance <= MAX_LINE_DISTANCE && distance < bestDistance) {
          bestDistance = distance;
          bestMapping = mapping;
        }
      }
    }
    
    if (bestMapping) {
      // Calculate the original line by adding the line offset to the source line
      const originalLine = bestMapping.source.line + (combinedLine - bestMapping.combined.line);
      
      // For column, use a sensible default if we're not on the exact mapping line
      const originalColumn = combinedLine === bestMapping.combined.line
        ? bestMapping.source.column + (combinedColumn - bestMapping.combined.column)
        : combinedColumn;
      
      const result = {
        filePath: bestMapping.source.filePath,
        line: originalLine,
        column: Math.max(1, originalColumn) // Ensure column is at least 1
      };
      
      logger.debug(`Mapped location ${combinedLine}:${combinedColumn} -> ${result.filePath}:${result.line}:${result.column}`);
      return result;
    }
    
    // If still no match found, look for the closest mapping that's greater than the target line
    // This handles cases where we're at the beginning of a file with no mappings yet
    bestMapping = null;
    bestDistance = Infinity;
    
    for (const mapping of this.mappings) {
      if (mapping.combined.line > combinedLine) {
        const distance = mapping.combined.line - combinedLine;
        if (distance < bestDistance && distance <= MAX_LINE_DISTANCE) {
          bestDistance = distance;
          bestMapping = mapping;
        }
      }
    }
    
    if (bestMapping) {
      // Since we're before the mapping, use source line 1 and adjust based on distance
      const originalLine = Math.max(1, bestMapping.source.line - bestDistance);
      
      const result = {
        filePath: bestMapping.source.filePath,
        line: originalLine,
        column: combinedColumn // Use the original column
      };
      
      logger.debug(`Nearest forward mapping: ${combinedLine}:${combinedColumn} -> ${result.filePath}:${result.line}:${result.column}`);
      return result;
    }
    
    logger.debug(`No mapping found for location ${combinedLine}:${combinedColumn}`);
    return null;
  }
  
  /**
   * Get debug information about all mappings
   * @returns String representation of all mappings
   */
  getDebugInfo(): string {
    if (this.mappings.length === 0) {
      return "No source mappings registered";
    }
    
    return "Source mappings:\n" + this.mappings.map(m => 
      `  ${m.source.filePath}:${m.source.line}:${m.source.column} -> ${m.combined.line}:${m.combined.column}`
    ).join('\n');
  }
  
  /**
   * Reset all mappings (useful for tests)
   */
  reset(): void {
    this.sources.clear();
    this.mappings = [];
    logger.debug("Source mappings have been reset");
  }
}

// Create a singleton instance for use throughout the app
export const sourceMapService = new SourceMapService();