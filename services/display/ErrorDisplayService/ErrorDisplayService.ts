/**
 * ErrorDisplayService.ts
 * 
 * Service for displaying errors with source context, highlighting, and formatting.
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import { MeldError } from '@core/errors/MeldError.js';
import { sourceMapService } from '@core/utils/SourceMapService.js';
import { extractLocationFromErrorObject } from '@core/utils/sourceMapUtils.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';

export interface IErrorDisplayService {
  formatError(error: MeldError): string;
  displayErrorWithSourceContext(error: MeldError): Promise<string>;
}

export class ErrorDisplayService implements IErrorDisplayService {
  private fileSystem: FileSystemService;

  constructor() {
    // Create a new FileSystemService for reading source files
    this.fileSystem = new FileSystemService(new NodeFileSystem());
  }

  /**
   * Format a basic error message without source context
   */
  formatError(error: MeldError): string {
    if (error.filePath) {
      return `Error in ${error.filePath}: ${error.message}`;
    }
    return `Error: ${error.message}`;
  }

  /**
   * Display an error with source code context, highlighting, and formatting
   */
  async displayErrorWithSourceContext(error: MeldError): Promise<string> {
    // If no source location, fall back to basic formatting
    if (!error.filePath || !error.context?.sourceLocation) {
      return this.formatError(error);
    }

    const sourceLocation = error.context.sourceLocation;
    const { filePath, line, column } = sourceLocation;
    
    try {
      // Get the source line from the file
      const sourceCode = await this.getSourceLine(filePath, line);
      if (!sourceCode) {
        return `Error in ${filePath}:${line}: ${error.message}`;
      }
      
      // Get the error length - how many characters to highlight
      const errorLength = error.context.length || 1;
      
      // Create the error display with highlighting
      const errorDisplay = this.highlightErrorInSource(sourceCode, column, errorLength);
      
      // Build the complete error message with context
      return [
        `Error in ${chalk.cyan(filePath)}:${chalk.yellow(line.toString())}`,
        error.message,
        '',
        errorDisplay.codeLine,
        errorDisplay.pointerLine
      ].join('\n');
    } catch (e) {
      // Fallback if reading the source or highlighting fails
      console.error("Failed to load source context:", e);
      return `Error in ${filePath}:${line}: ${error.message}`;
    }
  }

  /**
   * Read a specific line from a source file
   */
  private async getSourceLine(filePath: string, lineNumber: number): Promise<string | null> {
    try {
      // Read the file content
      const content = await this.fileSystem.readFile(filePath);
      
      // Split by lines and get the specific line (adjusting for 1-based indexing)
      const lines = content.split('\n');
      if (lineNumber > 0 && lineNumber <= lines.length) {
        return lines[lineNumber - 1];
      }
      
      return null;
    } catch (error) {
      console.error(`Failed to read source line from ${filePath}:${lineNumber}`, error);
      return null;
    }
  }

  /**
   * Highlight the error portion of a source line
   */
  private highlightErrorInSource(
    sourceLine: string, 
    column: number, 
    length: number = 1
  ): { codeLine: string, pointerLine: string } {
    // Ensure column is within bounds (1-based in source maps, 0-based for string ops)
    column = Math.max(0, Math.min(column - 1, sourceLine.length));
    
    // Create highlighted code line with bounds checking
    const beforeError = sourceLine.substring(0, column);
    const errorPart = sourceLine.substring(column, Math.min(column + length, sourceLine.length));
    const afterError = sourceLine.substring(Math.min(column + length, sourceLine.length));
    
    const codeLine = chalk.white(beforeError) + chalk.bgRed.white(errorPart) + chalk.white(afterError);
    
    // Create pointer line with caret
    const pointerLine = ' '.repeat(column) + chalk.red('^'.repeat(Math.max(1, errorPart.length)));
    
    return { codeLine, pointerLine };
  }

  /**
   * Enhance an error with source mapping information if available
   */
  async enhanceErrorDisplay(error: unknown): Promise<string> {
    // Convert unknown errors to MeldError
    const meldError = error instanceof MeldError 
      ? error 
      : new MeldError(error instanceof Error ? error.message : String(error));

    // If the error already has source location info, use it
    if (meldError.filePath && meldError.context?.sourceLocation) {
      return this.displayErrorWithSourceContext(meldError);
    }

    // Try to extract location from the error
    const location = extractLocationFromErrorObject(meldError);
    if (!location) {
      return this.formatError(meldError);
    }

    // Try to find original source location
    const sourceLocation = sourceMapService.findOriginalLocation(location.line, location.column);
    if (!sourceLocation) {
      return this.formatError(meldError);
    }

    // Create a new context with source location
    meldError.context = {
      ...meldError.context,
      sourceLocation
    };

    // Display with source context
    return this.displayErrorWithSourceContext(meldError);
  }
}