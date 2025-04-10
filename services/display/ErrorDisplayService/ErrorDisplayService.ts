/**
 * ErrorDisplayService.ts
 * 
 * Service for displaying errors with source context, highlighting, and formatting.
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import { injectable, inject } from 'tsyringe';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { MeldParseError } from '@core/errors/MeldParseError.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { MeldInterpreterError } from '@core/errors/MeldInterpreterError.js';
import { MeldImportError } from '@core/errors/MeldImportError.js';
import { MeldFileSystemError } from '@core/errors/MeldFileSystemError.js';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError.js';
import { MeldOutputError } from '@core/errors/MeldOutputError.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { PathValidationError as CorePathValidationError } from '@core/errors/PathValidationError.js';
import { ServiceInitializationError } from '@core/errors/ServiceInitializationError.js';
import { sourceMapService } from '@core/utils/SourceMapService.js';
import { extractLocationFromErrorObject } from '@core/utils/sourceMapUtils.js';
import { FileSystemService } from '@services/fs/FileSystemService/FileSystemService.js';
import { NodeFileSystem } from '@services/fs/FileSystemService/NodeFileSystem.js';

/**
 * Represents a source location with file path, line, and column
 */
export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
}

export interface IErrorDisplayService {
  formatError(error: MeldError): string;
  displayErrorWithSourceContext(error: MeldError): Promise<string>;
  enhanceErrorDisplay(error: unknown): Promise<string>;
}

@injectable()
export class ErrorDisplayService implements IErrorDisplayService {
  private fileSystem: FileSystemService;

  constructor(
    @inject('FileSystemService') fileSystem?: FileSystemService
  ) {
    // Use injected FileSystemService or create a new one if not provided
    this.fileSystem = fileSystem || new FileSystemService(new NodeFileSystem());
  }

  /**
   * Format a basic error message without source context
   * Simplified to remove error type labels and just show the location
   */
  formatError(error: MeldError): string {
    // Format file path if available
    if (error.filePath) {
      return chalk.dim(`    at ${chalk.cyan(error.filePath)}`);
    }
    
    // Fall back to a minimal error format if no file path is available
    return chalk.dim(`    at unknown location`);
  }
  
  /**
   * Get an appropriate error type label based on the error class
   */
  private getErrorTypeLabel(error: MeldError): string {
    if (error instanceof MeldParseError) return 'Parse Error';
    if (error instanceof MeldResolutionError) return 'Resolution Error';
    if (error instanceof MeldInterpreterError) return 'Interpreter Error';
    if (error instanceof MeldImportError) return 'Import Error';
    if (error instanceof MeldFileSystemError) return 'File System Error';
    if (error instanceof MeldFileNotFoundError) return 'File Not Found';
    if (error instanceof MeldOutputError) return 'Output Error';
    if (error instanceof MeldDirectiveError) return 'Directive Error';
    if (error instanceof CorePathValidationError) return 'Path Error';
    if (error instanceof ServiceInitializationError) return 'Service Error';
    
    // Use error.code as fallback if available
    if (error.code) return error.code;
    
    // Generic error label as last resort
    return 'Error';
  }
  
  /**
   * Get color function based on error severity
   */
  private getSeverityColor(severity: ErrorSeverity): (text: string) => string {
    switch (severity) {
      case ErrorSeverity.Fatal:
        return chalk.red.bold;
      case ErrorSeverity.Recoverable:
        return chalk.yellow.bold;
      case ErrorSeverity.Warning:
        return chalk.yellow;
      default:
        return chalk.red.bold;
    }
  }

  /**
   * Format resolution error with details
   */
  private formatResolutionError(error: MeldResolutionError, baseMessage: string): string {
    const details = error.details;
    if (!details) return baseMessage;
    
    const messages = [baseMessage];
    
    // Add variable information if available
    if (details.variableName) {
      messages.push(chalk.dim(`Variable: ${chalk.bold(details.variableName)}${details.variableType ? ` (${details.variableType})` : ''}`));
    }
    
    // Add field path if available
    if (details.fieldPath) {
      messages.push(chalk.dim(`Field path: ${chalk.bold(details.fieldPath)}`));
    }
    
    // Add value preview if available
    if (details.value) {
      const valuePreview = details.value.length > 80 
        ? details.value.substring(0, 77) + '...' 
        : details.value;
      messages.push(chalk.dim(`Value: ${valuePreview}`));
    }
    
    // Add content preview if available
    if (details.contentPreview) {
      const contentPreview = details.contentPreview.length > 80 
        ? details.contentPreview.substring(0, 77) + '...' 
        : details.contentPreview;
      messages.push(chalk.dim(`Content: ${contentPreview}`));
    }
    
    // Add context info if available
    if (details.context) {
      messages.push(chalk.dim(`Context: ${details.context}`));
    }
    
    return messages.join('\n');
  }
  
  /**
   * Format import error with details
   */
  private formatImportError(error: MeldImportError, baseMessage: string): string {
    // Get details from the context field
    const details = error.context;
    if (!details) return baseMessage;
    
    const messages = [baseMessage];
    
    // Add imported path if available
    if (details.importPath) {
      messages.push(chalk.dim(`Import path: ${chalk.bold(details.importPath)}`));
    }
    
    // Add resolved path if available and different from import path
    if (details.resolvedPath && details.resolvedPath !== details.importPath) {
      messages.push(chalk.dim(`Resolved path: ${chalk.bold(details.resolvedPath)}`));
    }
    
    // Add importing file if available
    if (details.importingFile && details.importingFile !== error.filePath) {
      messages.push(chalk.dim(`Importing from: ${chalk.bold(details.importingFile)}`));
    }
    
    return messages.join('\n');
  }
  
  /**
   * Format directive error with details
   */
  private formatDirectiveError(error: MeldDirectiveError, baseMessage: string): string {
    const messages = [baseMessage];
    
    // Add directive kind if available
    if (error.directiveKind) {
      messages.push(chalk.dim(`Directive: ${chalk.bold(error.directiveKind)}`));
    }
    
    // Add extra context details if available
    const details = error.context;
    if (details) {
      if (details.directiveName && details.directiveName !== error.directiveKind) {
        messages.push(chalk.dim(`Name: ${chalk.bold(details.directiveName)}`));
      }
      
      if (details.reason) {
        messages.push(chalk.dim(`Reason: ${details.reason}`));
      }
      
      if (details.expected && details.received) {
        messages.push(chalk.dim(`Expected: ${chalk.green(details.expected)}`));
        messages.push(chalk.dim(`Received: ${chalk.red(details.received)}`));
      }
    }
    
    return messages.join('\n');
  }
  
  /**
   * Format path validation error with details
   */
  private formatPathValidationError(error: CorePathValidationError, baseMessage: string): string {
    const messages = [baseMessage];
    
    // Add path code details
    if (error.code) {
      messages.push(chalk.dim(`Code: ${chalk.bold(error.code)}`));
    }
    
    // Add context details if available
    const details = error.context;
    if (details) {
      if (details.path && details.path !== error.filePath) {
        messages.push(chalk.dim(`Path: ${chalk.bold(details.path)}`));
      }
      
      if (details.expected) {
        messages.push(chalk.dim(`Expected: ${chalk.green(details.expected)}`));
      }
      
      if (details.received) {
        messages.push(chalk.dim(`Received: ${chalk.red(details.received)}`));
      }
    }
    
    return messages.join('\n');
  }
  
  /**
   * Format file system error with details
   */
  private formatFileSystemError(error: MeldFileSystemError, baseMessage: string): string {
    const messages = [baseMessage];
    
    // Add command if available
    if (error.command) {
      messages.push(chalk.dim(`Command: ${chalk.bold(error.command)}`));
    }
    
    // Add working directory if available
    if (error.cwd) {
      messages.push(chalk.dim(`Working directory: ${chalk.bold(error.cwd)}`));
    }
    
    return messages.join('\n');
  }
  
  /**
   * Format file not found error
   */
  private formatFileNotFoundError(error: MeldFileNotFoundError, baseMessage: string): string {
    return baseMessage;
  }
  
  /**
   * Format output error with details
   */
  private formatOutputError(error: MeldOutputError, baseMessage: string): string {
    const messages = [baseMessage];
    
    // Add format if available
    if (error.format) {
      messages.push(chalk.dim(`Format: ${chalk.bold(error.format)}`));
    }
    
    return messages.join('\n');
  }

  /**
   * Display an error with source code context, highlighting, and formatting
   */
  async displayErrorWithSourceContext(error: MeldError): Promise<string> {
    // Extract location based on error type
    const location = this.extractLocationFromError(error);
    
    // If no source location found, fall back to basic formatting
    if (!location) {
      return this.formatError(error);
    }

    const { filePath, line, column } = location;
    
    try {
      // Get the source line from the file
      const sourceCode = await this.getSourceLine(filePath, line);
      if (!sourceCode) {
        return this.formatError(error);
      }
      
      // Get the error length - determine how many characters to highlight
      let errorLength = 1; // Default to highlighting a single character
      
      // Extract length from different error types
      if (error.context?.length) {
        errorLength = error.context.length;
      } else if (error instanceof MeldParseError && error.location?.end) {
        // For parse errors, use start/end positions to calculate length
        if (error.location.start.line === error.location.end.line) {
          errorLength = error.location.end.column - error.location.start.column;
        }
      } else if (error instanceof MeldInterpreterError && error.context?.nodeLength) {
        errorLength = error.context.nodeLength;
      } else if (error instanceof MeldDirectiveError && error.context?.length) {
        errorLength = error.context.length;
      }
      
      // Ensure error length is at least 1
      errorLength = Math.max(1, errorLength);
      
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
      
      // Build the complete error message with context - SIMPLIFIED VERSION
      // Skip error type labels and just show the location information
      const errorHeader = [
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
      console.error('Failed to load source context:', e);
      return this.formatError(error);
    }
  }
  
  /**
   * Extract location information from different error types
   * Also recursively searches nested error objects to find location information
   */
  private extractLocationFromError(error: MeldError): { filePath: string, line: number, column: number } | null {
    // Initialize with default values
    let location: { filePath: string, line: number, column: number } | null = null;
    
    // Get file path from the error
    const filePath: string | undefined = error.filePath;
    
    // Helper to recursively search for location in the error chain
    const searchErrorChain = (err: any): void => {
      if (!err) return;
      
      // Handle different error types to extract location information
      if (err instanceof MeldParseError) {
        // For parse errors, use the location field
        if (err.location) {
          location = {
            filePath: err.location.filePath || filePath || '',
            line: err.location.start.line,
            column: err.location.start.column
          };
          return; // Found location, stop searching
        }
      } else if (err instanceof MeldInterpreterError) {
        // For interpreter errors, use the location field
        if (err.location) {
          location = {
            filePath: err.location.filePath || filePath || '',
            line: err.location.line,
            column: err.location.column
          };
          return; // Found location, stop searching
        }
      } else if (err instanceof MeldResolutionError) {
        // For resolution errors, check details.location
        if (err.details?.location) {
          location = {
            filePath: err.details.location.filePath || filePath || '',
            line: err.details.location.start.line,
            column: err.details.location.start.column
          };
          return; // Found location, stop searching
        }
      } else if (err instanceof MeldDirectiveError) {
        // For directive errors, use the location field
        if (err.location) {
          location = {
            filePath: err.location.filePath || filePath || '',
            line: err.location.line,
            column: err.location.column
          };
          return; // Found location, stop searching
        }
        
        // If no location on the directive error, extract from the message if possible
        const msgMatch = err.message.match(/at line (\d+), column (\d+)/i);
        if (msgMatch && msgMatch.length >= 3) {
          const line = parseInt(msgMatch[1], 10);
          const column = parseInt(msgMatch[2], 10);
          
          // Validate numbers are reasonable
          if (!isNaN(line) && !isNaN(column) && line > 0 && column >= 0) {
            location = {
              filePath: err.filePath || filePath || '',
              line: line,
              column: column
            };
            return; // Found location, stop searching
          }
        }
      }
      
      // Check for any direct line and column properties (might come from meld-ast)
      if (err.line !== undefined && err.column !== undefined) {
        // This checks direct line/column properties that might be on error objects
        // particularly from the meld-ast library
        location = {
          filePath: err.sourceFile || err.filePath || filePath || '',
          line: err.line,
          column: err.column
        };
        return; // Found location, stop searching
      }
      
      // Check the context field for source location information
      if (err.context?.sourceLocation) {
        location = {
          filePath: err.context.sourceLocation.filePath || filePath || '',
          line: err.context.sourceLocation.line,
          column: err.context.sourceLocation.column
        };
        return; // Found location, stop searching
      }
      
      // Continue searching in any nested error objects
      if (err.originalError) searchErrorChain(err.originalError);
      if (err.cause) searchErrorChain(err.cause);
      if (err.previous) searchErrorChain(err.previous);
      if (err.parent) searchErrorChain(err.parent);
    };
    
    // Start searching from the error object
    searchErrorChain(error);
    
    // If we didn't find a location but have a file path and there's a line/column in the error message
    // Try to extract line/column information from the error message itself
    const errorMsg = error.message || '';
    const lineColMatch = errorMsg.match(/(?:at|on|in|line)\s+(\d+)(?:,\s+column\s+|:|,\s+col(?:umn)?\s+)(\d+)/i);
    if (!location && filePath && lineColMatch) {
      return {
        filePath,
        line: parseInt(lineColMatch[1], 10),
        column: parseInt(lineColMatch[2], 10)
      };
    }
    
    // If we still didn't find a location and have node.location from the error and a file path
    if (!location && filePath && error.location) {
      if (error.location.start) {
        return {
          filePath,
          line: error.location.start.line,
          column: error.location.start.column
        };
      } else if (error.location.line && error.location.column) {
        return {
          filePath,
          line: error.location.line,
          column: error.location.column
        };
      }
    }
    
    // Last resort: if we have a file path but no location, use defaults
    if (!location && filePath) {
      // Check if the error has line and column as direct properties
      if (typeof error.line === 'number' && typeof error.column === 'number') {
        return {
          filePath,
          line: error.line,
          column: error.column
        };
      }
      
      return {
        filePath,
        line: 1,
        column: 1
      };
    }
    
    return location;
  }
  
  /**
   * Get additional details to display for specific error types
   */
  private getErrorDetails(error: MeldError): string[] {
    const details: string[] = [];
    
    if (error instanceof MeldResolutionError && error.details) {
      if (error.details.variableName) {
        details.push(`Variable: ${chalk.bold(error.details.variableName)}${error.details.variableType ? ` (${error.details.variableType})` : ''}`);
      }
      if (error.details.fieldPath) {
        details.push(`Field path: ${chalk.bold(error.details.fieldPath)}`);
      }
    } else if (error instanceof MeldImportError && error.context) {
      if (error.context.importPath) {
        details.push(`Import path: ${chalk.bold(error.context.importPath)}`);
      }
    } else if (error instanceof MeldDirectiveError) {
      if (error.directiveKind) {
        details.push(`Directive: ${chalk.bold(error.directiveKind)}`);
      }
    } else if (error instanceof MeldInterpreterError) {
      if (error.nodeType) {
        details.push(`Node type: ${chalk.bold(error.nodeType)}`);
      }
    }
    
    return details;
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
   * Adds improved support for handling nested errors from meld-ast
   */
  async enhanceErrorDisplay(error: unknown): Promise<string> {
    // 1. Convert unknown errors to MeldError
    let meldError: MeldError;
    
    if (error instanceof MeldError) {
      // Use the error directly if it's already a MeldError
      meldError = error;
      
      // Add the original error as the cause to preserve it for extraction
      if (error.originalError && !error.cause) {
        meldError.cause = error.originalError;
      }
    } else if (error instanceof Error) {
      // For standard Error instances, wrap them and preserve the stack
      meldError = new MeldError(error.message, { 
        cause: error,
        context: { 
          stack: error.stack,
          name: error.name
        }
      });
      
      // Copy any location properties directly from the original error
      // This helps with errors from meld-ast which might have line/column
      if ('line' in error && 'column' in error) {
        if (!meldError.context) meldError.context = {};
        meldError.context.sourceLocation = {
          filePath: (error as any).sourceFile || (error as any).filePath || '',
          line: (error as any).line,
          column: (error as any).column
        };
      }
      
      // Try to extract file path, line, and column from stack trace as backup
      const stackInfo = this.extractInfoFromStack(error.stack);
      if (stackInfo && !meldError.context?.sourceLocation) {
        if (!meldError.context) meldError.context = {};
        meldError.context.sourceLocation = {
          filePath: stackInfo.filePath,
          line: stackInfo.line,
          column: stackInfo.column
        };
      }
    } else {
      // For non-Error values, convert to string
      meldError = new MeldError(String(error));
    }

    // 2. Try different strategies to get location information
    
    // Check for location in directive errors
    if (meldError instanceof MeldDirectiveError && meldError.location) {
      if (!meldError.context) meldError.context = {};
      meldError.context.sourceLocation = {
        filePath: meldError.location.filePath || meldError.filePath || '',
        line: meldError.location.line,
        column: meldError.location.column
      };
      
      return this.displayErrorWithSourceContext(meldError);
    }
    
    // Extract line and column directly from error message
    const lineColumnFromMessage = extractErrorLocation(meldError);
    if (lineColumnFromMessage && meldError.filePath) {
      if (!meldError.context) meldError.context = {};
      meldError.context.sourceLocation = {
        filePath: meldError.filePath,
        line: lineColumnFromMessage.line,
        column: lineColumnFromMessage.column
      };
      
      return this.displayErrorWithSourceContext(meldError);
    }
    
    // Check if we already have a location on the error or nested errors
    const location = this.extractLocationFromError(meldError);
    if (location) {
      // Update the error with the extracted location to ensure it's used in display
      if (!meldError.context) meldError.context = {};
      meldError.context.sourceLocation = location;
      
      // We found location directly in the error or nested errors, use it for display
      return this.displayErrorWithSourceContext(meldError);
    }
    
    // Check if we can use source mapping to find location
    try {
      // Try to extract location from the error object or stack
      const extractedLocation = extractLocationFromErrorObject(meldError);
      if (extractedLocation) {
        // Try to find original source location using sourcemaps
        const sourceLocation = sourceMapService.findOriginalLocation(
          extractedLocation.line, 
          extractedLocation.column
        );
        
        if (sourceLocation) {
          // We found a source-mapped location, add it to the error context
          if (!meldError.context) meldError.context = {};
          meldError.context.sourceLocation = sourceLocation;
          
          // Display with source context
          return this.displayErrorWithSourceContext(meldError);
        }
        
        // If we have a filePath but source mapping failed, create a direct location
        if (meldError.filePath) {
          if (!meldError.context) meldError.context = {};
          meldError.context.sourceLocation = {
            filePath: meldError.filePath,
            line: extractedLocation.line,
            column: extractedLocation.column
          };
          
          return this.displayErrorWithSourceContext(meldError);
        }
      }
    } catch (mappingError) {
      console.error('Error during source mapping:', mappingError);
      // Continue to fallback methods if source mapping fails
    }
    
    // Try to handle composite error messages with recursive extraction
    if (meldError.message.includes('at line') && meldError.message.includes('column')) {
      const nestedLocations = [];
      // Extract all line/column references from the message
      const errorMsg = meldError.message;
      const pattern = /(?:at|on|in|line)\s+(?:line\s+)?(\d+)(?:,\s+column\s+|:)(\d+)/gi;
      let match;
      
      while ((match = pattern.exec(errorMsg)) !== null) {
        if (match && match.length >= 3) {
          const line = parseInt(match[1], 10);
          const column = parseInt(match[2], 10);
          if (!isNaN(line) && !isNaN(column)) {
            nestedLocations.push({ line, column, index: match.index });
          }
        }
      }
      
      // If we found multiple locations, use the last one (most specific)
      if (nestedLocations.length > 0 && meldError.filePath) {
        // Sort by position in the string (later matches are more specific)
        nestedLocations.sort((a, b) => b.index - a.index);
        const lastMatch = nestedLocations[0];
        
        if (!meldError.context) meldError.context = {};
        meldError.context.sourceLocation = {
          filePath: meldError.filePath,
          line: lastMatch.line,
          column: lastMatch.column
        };
        
        return this.displayErrorWithSourceContext(meldError);
      }
    }
    
    // 3. If all else fails, just format the error without source context,
    // but still prioritize showing just location information
    if (meldError.filePath) {
      return chalk.dim(`    at ${chalk.cyan(meldError.filePath)}`);
    }
    
    return this.formatError(meldError);
  }
  
  /**
   * Extract file path, line, and column from a stack trace string
   * 
   * Example stack format: "at Object.<anonymous> (/path/to/file.js:10:15)"
   */
  private extractInfoFromStack(stack?: string): { filePath: string, line: number, column: number } | null {
    if (!stack) return null;
    
    // Get lines from the stack
    const lines = stack.split('\n');
    
    // Skip the first line which is usually the error message
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Match common Node.js stack trace format
      const match = line.match(/at\s+(?:\w+\s+)?\(?([^:]+):(\d+):(\d+)\)?/);
      if (match) {
        const [, filePath, lineStr, columnStr] = match;
        return {
          filePath,
          line: parseInt(lineStr, 10),
          column: parseInt(columnStr, 10)
        };
      }
    }
    
    return null;
  }
}