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
    // Find the closest mapping that's less than or equal to the target line
    let bestMapping = null;
    let bestDistance = Infinity;
    
    for (const mapping of this.mappings) {
      if (mapping.combined.line <= combinedLine) {
        const distance = combinedLine - mapping.combined.line;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMapping = mapping;
        }
      }
    }
    
    if (bestMapping) {
      // Calculate the original line by adding the line offset to the source line
      const originalLine = bestMapping.source.line + (combinedLine - bestMapping.combined.line);
      
      // For column, only use the original column if we're on the exact same line
      const originalColumn = combinedLine === bestMapping.combined.line
        ? bestMapping.source.column + (combinedColumn - bestMapping.combined.column)
        : combinedColumn;
      
      const result = {
        filePath: bestMapping.source.filePath,
        line: originalLine,
        column: originalColumn
      };
      
      logger.debug(`Mapped location ${combinedLine}:${combinedColumn} -> ${result.filePath}:${result.line}:${result.column}`);
      
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