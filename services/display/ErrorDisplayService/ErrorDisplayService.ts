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
      
      // Try to get surrounding context lines (2 lines before and after)
      const contextLines = [];
      
      // Get lines before the error line
      for (let i = Math.max(1, line - 2); i < line; i++) {
        const contextLine = await this.getSourceLine(filePath, i);
        if (contextLine !== null) {
          contextLines.push({ 
            lineNumber: i, 
            content: chalk.dim(`${i.toString().padStart(4)} | `) + chalk.dim(contextLine) 
          });
        }
      }
      
      // Add the error line with highlighting
      contextLines.push({ 
        lineNumber: line, 
        content: chalk.bold(`${line.toString().padStart(4)} | `) + errorDisplay.codeLine,
        pointer: '     | ' + errorDisplay.pointerLine
      });
      
      // Get lines after the error line
      for (let i = line + 1; i <= line + 2; i++) {
        const contextLine = await this.getSourceLine(filePath, i);
        if (contextLine !== null) {
          contextLines.push({ 
            lineNumber: i, 
            content: chalk.dim(`${i.toString().padStart(4)} | `) + chalk.dim(contextLine) 
          });
        }
      }
      
      // Build the complete error message with context
      const errorHeader = [
        // Add error type (e.g., SyntaxError) if available
        error.code ? chalk.red.bold(`${error.code}: `) + error.message : chalk.red.bold(`Error: `) + error.message,
        chalk.dim(`    at ${chalk.cyan(filePath)}:${chalk.yellow(line.toString())}:${chalk.yellow(column.toString())}`)
      ];
      
      // Add the code context with line numbers and highlighting
      const codeContext = [];
      contextLines.forEach(ctx => {
        codeContext.push(ctx.content);
        if (ctx.pointer) {
          codeContext.push(ctx.pointer);
        }
      });
      
      return [
        ...errorHeader,
        '',
        ...codeContext
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
      // Make sure line number is valid
      if (lineNumber <= 0) {
        console.error(`Invalid line number: ${lineNumber} (must be > 0)`);
        return null;
      }
      
      // Check if the file exists
      const exists = await this.fileSystem.exists(filePath);
      if (!exists) {
        console.error(`File does not exist: ${filePath}`);
        return null;
      }
      
      try {
        // Read the file content
        const content = await this.fileSystem.readFile(filePath);
        
        // Split by lines and get the specific line (adjusting for 1-based indexing)
        const lines = content.split('\n');
        
        if (lineNumber <= lines.length) {
          return lines[lineNumber - 1];
        } else {
          console.error(`Line number ${lineNumber} exceeds file length (${lines.length} lines)`);
          
          // Return the last line as a fallback if line number is too large
          if (lines.length > 0) {
            return lines[lines.length - 1];
          }
          
          return null;
        }
      } catch (readError) {
        console.error(`Failed to read file: ${filePath}`, readError);
        return null;
      }
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
    // Handle empty source line gracefully
    if (!sourceLine) {
      return { 
        codeLine: chalk.dim('[empty line]'), 
        pointerLine: chalk.red('^') 
      };
    }
    
    // Ensure column is within bounds (1-based in source maps, 0-based for string ops)
    // Subtract 1 from column if it's greater than 0 (to convert from 1-based to 0-based)
    const adjustedColumn = column > 0 ? Math.max(0, Math.min(column - 1, sourceLine.length)) : 0;
    
    // Ensure error length is reasonable
    const adjustedLength = Math.max(1, Math.min(length, sourceLine.length - adjustedColumn));
    
    // Create highlighted code line with bounds checking
    const beforeError = sourceLine.substring(0, adjustedColumn);
    const errorPart = sourceLine.substring(adjustedColumn, Math.min(adjustedColumn + adjustedLength, sourceLine.length)) || ' ';
    const afterError = sourceLine.substring(Math.min(adjustedColumn + adjustedLength, sourceLine.length));
    
    // Create colorized code line
    const codeLine = chalk.white(beforeError) + chalk.bgRed.white(errorPart) + chalk.white(afterError);
    
    // Create pointer line with caret(s)
    let pointerLine;
    
    // For very long lines, add a margin indicator to show where the error is
    if (adjustedColumn > 80) {
      // For errors far to the right, show an arrow pointing to the error
      pointerLine = chalk.dim('... ') + ' '.repeat(Math.min(76, adjustedColumn - 4)) + 
                    chalk.red('^'.repeat(Math.max(1, errorPart.length)));
    } else {
      pointerLine = ' '.repeat(adjustedColumn) + 
                    chalk.red('^'.repeat(Math.max(1, errorPart.length)));
    }
    
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

    // Check if we have a fallback file path in the context
    const contextFilePath = meldError.context?.errorFilePath || meldError.context?.sourceLocation?.filePath;
    const effectiveFilePath = meldError.filePath || contextFilePath;
    
    // If we have a file path in context but not in the error, use it
    if (contextFilePath && !meldError.filePath) {
      // We can't modify filePath directly since it's read-only, but we can use sourceLocation
      if (!meldError.context) meldError.context = {};
      if (!meldError.context.sourceLocation) {
        meldError.context.sourceLocation = {
          filePath: contextFilePath,
          line: 1,
          column: 1
        };
      }
    }

    // If the error already has source location info, use it
    if (meldError.context?.sourceLocation) {
      return this.displayErrorWithSourceContext(meldError);
    }

    // Try to extract location from the error
    const location = extractLocationFromErrorObject(meldError);
    if (!location) {
      return this.formatError(meldError);
    }

    // Try to find original source location
    const sourceLocation = sourceMapService.findOriginalLocation(location.line, location.column);

    // If we found a source location, use it
    if (sourceLocation) {
      // Create a new context with source location
      meldError.context = {
        ...meldError.context,
        sourceLocation
      };

      // Display with source context
      return this.displayErrorWithSourceContext(meldError);
    }
    
    // If we couldn't find a source location but we have a file path, try to read that file directly
    if (effectiveFilePath && location) {
      // Create a source location with the file path
      const directLocation: SourceLocation = {
        filePath: effectiveFilePath,
        line: location.line,
        column: location.column
      };
      
      // Set the source location in the context
      meldError.context = {
        ...meldError.context,
        sourceLocation: directLocation,
        // Add the error length if we know it (for better highlighting)
        length: meldError.context?.length || 1
      };
      
      return this.displayErrorWithSourceContext(meldError);
    }

    // Fallback to simple format if we couldn't enhance
    return this.formatError(meldError);
  }
}