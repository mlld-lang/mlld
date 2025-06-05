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

    // Add source context if available and requested
    if (showSourceContext && error.sourceLocation) {
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
          const contextDisplay = this.formatSourceContext(sourceContext, useColors);
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
          const contextDisplay = this.formatSourceContext(enhancedSourceContext, useColors);
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

  private formatSourceContext(context: SourceContext, useColors: boolean): string {
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
          useColors
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

  private createErrorIndicator(prefixLength: number, column: number, lineContent: string, useColors: boolean): string | null {
    if (column < 1) return null;

    // Create spacing to align with the error column
    const spaces = ' '.repeat(prefixLength + column - 1);
    const indicator = '^';
    
    return useColors 
      ? `${spaces}${chalk.red.bold(indicator)}`
      : `${spaces}${indicator}`;
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