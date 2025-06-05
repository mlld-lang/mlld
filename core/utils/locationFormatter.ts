import type { InterpreterLocation, ErrorSourceLocation } from '@core/types';

export interface FormattedLocation {
  readonly display: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
}

export function formatLocation(location: InterpreterLocation | ErrorSourceLocation | undefined): FormattedLocation {
  if (!location) {
    return { display: 'unknown location' };
  }

  if ('filePath' in location && location.filePath) {
    const parts: string[] = [];
    
    if (location.filePath) {
      parts.push(location.filePath);
    }
    
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
      column: location.column
    };
  }

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

export function formatLocationForError(location: InterpreterLocation | ErrorSourceLocation | undefined): string {
  return formatLocation(location).display;
}