import { MlldError } from '@core/errors/MlldError';
import { ErrorDisplayFormatter } from './errorDisplayFormatter';
import { IFileSystemService } from '@services/fs/IFileSystemService';

export interface ErrorFormatOptions {
  useColors?: boolean;
  useSourceContext?: boolean;
  useSmartPaths?: boolean;
  basePath?: string;
  workingDirectory?: string;
  contextLines?: number;
}

export interface FormattedErrorResult {
  formatted: string;
  raw: MlldError;
  json: Record<string, any>;
}

/**
 * Unified error formatting for both CLI and API usage
 */
export class ErrorFormatSelector {
  private formatter?: ErrorDisplayFormatter;

  constructor(private fileSystem?: IFileSystemService) {
    if (fileSystem) {
      this.formatter = new ErrorDisplayFormatter(fileSystem);
    }
  }

  /**
   * Format error for CLI display with colors and context
   */
  async formatForCLI(
    error: MlldError,
    options: ErrorFormatOptions = {}
  ): Promise<string> {
    if (!this.formatter) {
      return this.formatForAPI(error, options).formatted;
    }

    return await this.formatter.formatError(error, {
      showSourceContext: options.useSourceContext ?? true,
      useColors: options.useColors ?? true,
      useSmartPaths: options.useSmartPaths ?? true,
      basePath: options.basePath,
      workingDirectory: options.workingDirectory || process.cwd(),
      contextLines: options.contextLines || 2
    });
  }

  /**
   * Format error for API usage (no colors, structured data)
   */
  formatForAPI(
    error: MlldError,
    options: ErrorFormatOptions = {}
  ): FormattedErrorResult {
    // Create a clean, structured representation
    const json = {
      name: error.name,
      message: error.message,
      code: error.code,
      severity: error.severity,
      sourceLocation: error.sourceLocation,
      details: error.details,
      cause: error.cause instanceof Error ? {
        name: error.cause.name,
        message: error.cause.message
      } : error.cause
    };

    // Create a simple formatted version (no colors, minimal context)
    let formatted = `${error.name}: ${error.message}`;
    
    if (error.sourceLocation) {
      if ('filePath' in error.sourceLocation && error.sourceLocation.filePath) {
        let location = error.sourceLocation.filePath;
        if (error.sourceLocation.line) {
          location += `:${error.sourceLocation.line}`;
          if (error.sourceLocation.column) {
            location += `:${error.sourceLocation.column}`;
          }
        }
        formatted += `\n  at ${location}`;
      } else if ('line' in error.sourceLocation && error.sourceLocation.line) {
        formatted += `\n  at line ${error.sourceLocation.line}`;
        if (error.sourceLocation.column) {
          formatted += `, column ${error.sourceLocation.column}`;
        }
      }
    }

    if (error.details?.suggestion) {
      formatted += `\n\nSuggestion: ${error.details.suggestion}`;
    }

    return {
      formatted,
      raw: error,
      json
    };
  }

  /**
   * Auto-detect appropriate format based on environment
   */
  async formatAuto(
    error: MlldError,
    options: ErrorFormatOptions = {}
  ): Promise<FormattedErrorResult> {
    const isTTY = process.stdout?.isTTY ?? false;
    const hasColors = options.useColors ?? isTTY;
    const hasContext = options.useSourceContext ?? isTTY;

    if (hasColors && hasContext && this.formatter) {
      const formatted = await this.formatForCLI(error, {
        ...options,
        useColors: hasColors,
        useSourceContext: hasContext
      });
      
      return {
        formatted,
        raw: error,
        json: error.toJSON()
      };
    } else {
      return this.formatForAPI(error, options);
    }
  }
}