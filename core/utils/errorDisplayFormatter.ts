import chalk from 'chalk';
import { MlldError } from '@core/errors/MlldError';
import { SourceContextExtractor, SourceContext } from './sourceContextExtractor';
import { EnhancedLocationFormatter } from './enhancedLocationFormatter';
import { IFileSystemService } from '@services/fs/IFileSystemService';

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
      const formattedLocation = formatLocation(error.sourceLocation);
      
      if (formattedLocation.file) {
        const sourceContext = await this.sourceExtractor.extractContext(formattedLocation, {
          contextLines,
          maxLineLength
        });

        if (sourceContext) {
          const contextDisplay = this.formatSourceContext(sourceContext, useColors);
          parts.push(contextDisplay);
        }
      }
    }

    // Add error details
    const detailsDisplay = this.formatErrorDetails(error, useColors);
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

  private formatErrorDetails(error: MlldError, useColors: boolean): string | null {
    if (!error.details || typeof error.details !== 'object') {
      return null;
    }

    const { formatLocationForError } = require('./locationFormatter');
    const relevantDetails = Object.entries(error.details)
      .filter(([key, value]) => {
        // Skip suggestion as it's handled separately
        if (key === 'suggestion') return false;
        return value !== undefined && value !== null;
      })
      .map(([key, value]) => {
        // Format location objects specially
        if (value && typeof value === 'object' && 
            ('line' in value || 'filePath' in value)) {
          return `  ${key}: ${formatLocationForError(value)}`;
        }
        return `  ${key}: ${String(value)}`;
      });

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