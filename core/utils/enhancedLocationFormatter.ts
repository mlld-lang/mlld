import type { InterpreterLocation, ErrorSourceLocation } from '@core/types';
import { SmartPathResolver, SmartPathOptions } from './smartPathResolver';
import { IFileSystemService } from '@services/fs/IFileSystemService';

export interface EnhancedFormattedLocation {
  readonly display: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly isRelative?: boolean;
  readonly isWithinProject?: boolean;
}

export interface FormatLocationOptions extends SmartPathOptions {
  useSmartPaths?: boolean;
}

export class EnhancedLocationFormatter {
  private pathResolver: SmartPathResolver;

  constructor(fileSystem: IFileSystemService) {
    this.pathResolver = new SmartPathResolver(fileSystem);
  }

  async formatLocation(
    location: InterpreterLocation | ErrorSourceLocation | undefined,
    options: FormatLocationOptions = {}
  ): Promise<EnhancedFormattedLocation> {
    const { useSmartPaths = true, ...pathOptions } = options;

    if (!location) {
      return { display: 'unknown location' };
    }

    // Handle locations with file paths
    if ('filePath' in location && location.filePath) {
      let displayPath = location.filePath;
      let isRelative = false;
      let isWithinProject = false;

      if (useSmartPaths) {
        try {
          const resolvedPath = await this.pathResolver.resolvePath(location.filePath, pathOptions);
          displayPath = resolvedPath.display;
          isRelative = resolvedPath.isRelative;
          isWithinProject = resolvedPath.isWithinProject;
        } catch {
          // Fall back to absolute path if smart resolution fails
          displayPath = location.filePath;
        }
      }

      const parts: string[] = [displayPath];
      
      if (location.line !== undefined) {
        if (location.column !== undefined) {
          parts.push(`${location.line}:${location.column}`);
        } else {
          parts.push(`line ${location.line}`);
        }
      }
      
      return {
        display: parts.join(':'),
        file: location.filePath,
        line: location.line,
        column: location.column,
        isRelative,
        isWithinProject
      };
    }

    // Handle locations without file paths (line/column only)
    if ('line' in location && location.line !== undefined) {
      const parts: string[] = [];
      
      if (location.column !== undefined) {
        parts.push(`line ${location.line}, column ${location.column}`);
      } else {
        parts.push(`line ${location.line}`);
      }
      
      return {
        display: parts.join(''),
        line: location.line,
        column: location.column
      };
    }

    return { display: 'unknown location' };
  }

  async formatLocationForError(
    location: InterpreterLocation | ErrorSourceLocation | undefined,
    options: FormatLocationOptions = {}
  ): Promise<string> {
    const formatted = await this.formatLocation(location, options);
    return formatted.display;
  }

  clearCache(): void {
    this.pathResolver.clearCache();
  }
}