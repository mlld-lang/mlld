import chalk from 'chalk';
import { MlldError } from '@core/errors/MlldError';
import { SourceContextExtractor, SourceContext } from './sourceContextExtractor';
import { EnhancedLocationFormatter } from './enhancedLocationFormatter';
import { IFileSystemService } from '@services/fs/IFileSystemService';
import { logger } from '@core/utils/logger';

export interface ErrorDisplayOptions {
  showSourceContext?: boolean;
  contextLines?: number;
  maxLineLength?: number;
  useColors?: boolean;
  useSmartPaths?: boolean;
  basePath?: string;
  workingDirectory?: string;
}

export class ErrorDisplayFormatter {
  private sourceExtractor: SourceContextExtractor;
  private locationFormatter: EnhancedLocationFormatter;

  constructor(fileSystem: IFileSystemService) {
    this.sourceExtractor = new SourceContextExtractor(fileSystem);
    this.locationFormatter = new EnhancedLocationFormatter(fileSystem);
  }

  async formatError(error: MlldError, options: ErrorDisplayOptions = {}): Promise<string> {
    const {
      showSourceContext = true,
      contextLines = 2,
      maxLineLength = 120,
      useColors = true,
      useSmartPaths = true,
      basePath,
      workingDirectory = process.cwd()
    } = options;

    const parts: string[] = [];

    // Format the main error message
    const errorHeader = this.formatErrorHeader(error, useColors);
    parts.push(errorHeader);

    // Add Peggy formatted section if available (right after header for parse errors)
    if (error.details?.peggyFormatted) {
      // Add parse error indicator
      const parseErrorIndicator = useColors 
        ? chalk.red.bold('✘ Parse Error')
        : '✘ Parse Error';
      parts.push('\n' + parseErrorIndicator);
      
      // Extract and add the source code section from Peggy's format
      const sourceSection = this.extractPeggySourceSection(error.details.peggyFormatted, useColors);
      if (sourceSection) {
        parts.push(sourceSection);
      }
    }

    // Add source context if available and requested (skip if we have Peggy formatting)
    if (showSourceContext && error.sourceLocation && !error.details?.peggyFormatted) {
      logger.debug('[ErrorDisplay] Formatting source context:', {
        sourceLocation: error.sourceLocation,
        errorDetails: error.details,
        hasFile: !!(error.sourceLocation as any).filePath || !!(error.details?.filePath)
      });
      
      const formattedLocation = await this.locationFormatter.formatLocation(error.sourceLocation, {
        useSmartPaths,
        basePath,
        workingDirectory,
        preferRelative: true,
        maxRelativeDepth: 3
      });
      
      logger.debug('[ErrorDisplay] Formatted location:', formattedLocation);
      
      // Check if we have source content stored in the error (for parse errors)
      const sourceContent = (error as any).sourceContent || error.details?.sourceContent;
      
      if (sourceContent) {
        // Use source content directly when available (more reliable than file reading)
        const sourceContext = this.sourceExtractor.extractContextFromSource(
          sourceContent,
          {
            display: formattedLocation.display,
            file: formattedLocation.displayPath || formattedLocation.file || '<stdin>',
            line: formattedLocation.line,
            column: formattedLocation.column
          },
          {
            contextLines,
            maxLineLength
          }
        );

        logger.debug('[ErrorDisplay] Source context from content:', {
          hasContext: !!sourceContext,
          sourceLength: sourceContent.length,
          lines: sourceContext?.lines?.length
        });

        if (sourceContext) {
          const contextDisplay = this.formatSourceContext(sourceContext, useColors, error.details?.mlldLocation);
          parts.push(contextDisplay);
        }
      } else if (formattedLocation.file) {
        // Use original file path for source extraction (absolute path needed)
        const sourceContext = await this.sourceExtractor.extractContext({
          display: formattedLocation.display,
          file: formattedLocation.file, // Use absolute path for file reading
          line: formattedLocation.line,
          column: formattedLocation.column
        }, {
          contextLines,
          maxLineLength
        });

        logger.debug('[ErrorDisplay] Source context extracted:', {
          hasContext: !!sourceContext,
          file: formattedLocation.file,
          lines: sourceContext?.lines?.length
        });

        if (sourceContext) {
          // Update the source context to use the smart display path
          const enhancedSourceContext = {
            ...sourceContext,
            file: formattedLocation.displayPath || formattedLocation.file // Use smart path for display
          };
          const contextDisplay = this.formatSourceContext(enhancedSourceContext, useColors, error.details?.mlldLocation);
          parts.push(contextDisplay);
        }
      } else {
        logger.debug('[ErrorDisplay] No file path in formatted location and no source content');
      }
    } else {
      logger.debug('[ErrorDisplay] No source context requested or no sourceLocation:', {
        showSourceContext,
        hasSourceLocation: !!error.sourceLocation
      });
    }

    // Add error details
    const detailsDisplay = await this.formatErrorDetails(error, useColors, {
      useSmartPaths,
      basePath,
      workingDirectory
    });
    if (detailsDisplay) {
      parts.push(detailsDisplay);
    }

    // Add directive trace if available
    if (error.details?.directiveTrace && error.details.directiveTrace.length > 0) {
      const { DirectiveTraceFormatter } = await import('./DirectiveTraceFormatter');
      const traceFormatter = new DirectiveTraceFormatter();
      const trace = traceFormatter.format(error.details.directiveTrace, useColors);
      parts.push('\n' + trace);
    }

    // Add suggestion if available
    if (error.details?.suggestion) {
      const suggestion = useColors 
        ? chalk.cyan(`💡 ${error.details.suggestion}`)
        : `💡 ${error.details.suggestion}`;
      parts.push(suggestion);
    }

    return parts.join('\n\n');
  }

  private formatErrorHeader(error: MlldError, useColors: boolean): string {
    const errorName = error.name.replace('Error', '');
    
    if (useColors) {
      return chalk.red.bold(`${errorName}: ${error.message}`);
    }
    
    return `${errorName}: ${error.message}`;
  }

  private formatSourceContext(context: SourceContext, useColors: boolean, mlldLocation?: any): string {
    const parts: string[] = [];

    // File header
    if (context.file) {
      const fileHeader = useColors
        ? chalk.blue.bold(`  ${context.file}:${context.errorLine}:${context.errorColumn}`)
        : `  ${context.file}:${context.errorLine}:${context.errorColumn}`;
      parts.push(fileHeader);
    }

    // Source lines
    const maxLineNum = Math.max(...context.lines.map(l => l.number));
    const lineNumWidth = String(maxLineNum).length;

    for (const line of context.lines) {
      const lineNum = String(line.number).padStart(lineNumWidth, ' ');
      const prefix = `  ${lineNum} | `;
      
      if (line.isErrorLine) {
        // Error line with highlighting
        const errorLineDisplay = useColors
          ? chalk.red(`${prefix}${line.content}`)
          : `${prefix}${line.content}`;
        parts.push(errorLineDisplay);

        // Add error indicator
        const indicator = this.createErrorIndicator(
          prefix.length, 
          context.errorColumn, 
          line.content,
          useColors,
          mlldLocation
        );
        if (indicator) {
          parts.push(indicator);
        }
      } else {
        // Context line
        const contextLineDisplay = useColors
          ? chalk.gray(`${prefix}${line.content}`)
          : `${prefix}${line.content}`;
        parts.push(contextLineDisplay);
      }
    }

    return parts.join('\n');
  }

  private createErrorIndicator(
    prefixLength: number, 
    column: number, 
    lineContent: string, 
    useColors: boolean,
    mlldLocation?: any
  ): string | null {
    if (column < 1) return null;

    // If we have mlldLocation with precise position info, use it
    if (mlldLocation && mlldLocation.column && mlldLocation.length) {
      // Use the precise column from mlldLocation
      const actualColumn = mlldLocation.column;
      const errorLength = mlldLocation.length || 1;
      
      // Create spacing to align with the error position
      const spaces = ' '.repeat(prefixLength + actualColumn - 1);
      const arrows = '^'.repeat(Math.min(errorLength, lineContent.length - actualColumn + 1));
      
      // Add expected token hint if available
      let hint = '';
      if (mlldLocation.expectedToken) {
        hint = ` Expected: ${mlldLocation.expectedToken}`;
      }
      
      return useColors 
        ? `${spaces}${chalk.red.bold(arrows)}${chalk.yellow(hint)}`
        : `${spaces}${arrows}${hint}`;
    }

    // Fallback to simple indicator
    const spaces = ' '.repeat(prefixLength + column - 1);
    const indicator = '^';
    
    return useColors 
      ? `${spaces}${chalk.red.bold(indicator)}`
      : `${spaces}${indicator}`;
  }

  private extractPeggySourceSection(peggyFormatted: string, useColors: boolean): string | null {
    // Parse Peggy's format to extract the full source code display with arrows
    const lines = peggyFormatted.split('\n');
    const sourceLines: string[] = [];
    let inSourceSection = false;
    
    for (const line of lines) {
      // Start collecting after the location line (e.g., " --> file.mld:5:10")
      if (line.trim().startsWith('-->')) {
        // Include the location line itself
        sourceLines.push(line);
        inSourceSection = true;
        continue;
      }
      
      // Collect ALL lines in source section (including arrows and empty lines)
      if (inSourceSection) {
        // Check if we've hit the end of the source section
        // This is typically a completely empty line after the arrow indicators
        if (line === '' && sourceLines.length > 2 && 
            sourceLines[sourceLines.length - 1].includes('^')) {
          // We've likely hit the end of the source section
          break;
        }
        
        // Include all lines that are part of the source display:
        // - Lines with line numbers (e.g., "1 | /var @items = [")
        // - Lines with pipe separators (e.g., "  |")
        // - Lines with arrow indicators (e.g., "  | ^^^^^^^")
        // - Empty lines within the section
        sourceLines.push(line);
      }
    }
    
    return sourceLines.length > 0 ? sourceLines.join('\n') : null;
  }

  private async formatErrorDetails(
    error: MlldError, 
    useColors: boolean,
    pathOptions: { useSmartPaths?: boolean; basePath?: string; workingDirectory?: string; }
  ): Promise<string | null> {
    if (!error.details || typeof error.details !== 'object') {
      return null;
    }

    const relevantDetails = [];
    
    for (const [key, value] of Object.entries(error.details)) {
      // Skip suggestion as it's handled separately
      if (key === 'suggestion') continue;
      // Skip sourceContent as it's only for internal use
      if (key === 'sourceContent') continue;
      // Skip peggyFormatted as it's handled separately
      if (key === 'peggyFormatted') continue;
      // Skip mlldLocation as it's used for arrow indicators
      if (key === 'mlldLocation') continue;
      if (value === undefined || value === null) continue;

      // Format location objects specially with smart paths
      if (value && typeof value === 'object' && 
          ('line' in value || 'filePath' in value)) {
        try {
          const formattedLocation = await this.locationFormatter.formatLocationForError(value, pathOptions);
          relevantDetails.push(`  ${key}: ${formattedLocation}`);
        } catch {
          // Fallback to basic formatting if smart formatting fails
          const { formatLocationForError } = require('./locationFormatter');
          relevantDetails.push(`  ${key}: ${formatLocationForError(value)}`);
        }
      } else {
        relevantDetails.push(`  ${key}: ${String(value)}`);
      }
    }

    if (relevantDetails.length === 0) {
      return null;
    }

    const header = useColors ? chalk.gray('Details:') : 'Details:';
    const details = useColors 
      ? chalk.gray(relevantDetails.join('\n'))
      : relevantDetails.join('\n');

    return `${header}\n${details}`;
  }
}