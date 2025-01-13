import type { Location } from 'meld-spec';
import {
  MeldError,
  MeldParseError,
  MeldInterpretError,
  MeldImportError,
  MeldDirectiveError,
  MeldEmbedError
} from './errors';

/**
 * Factory class for creating Meld errors with proper location context
 */
export class ErrorFactory {
  /**
   * Create a parse error with location context
   */
  static createParseError(message: string, location?: Location['start']): MeldParseError {
    return new MeldParseError(message, location);
  }

  /**
   * Create an interpret error with location context and optional node type
   */
  static createInterpretError(
    message: string,
    nodeType?: string,
    location?: Location['start']
  ): MeldInterpretError {
    return new MeldInterpretError(message, nodeType, location);
  }

  /**
   * Create an import error with location context
   */
  static createImportError(message: string, location?: Location['start']): MeldImportError {
    return new MeldImportError(message, location);
  }

  /**
   * Create a directive error with location context
   */
  static createDirectiveError(
    message: string,
    directiveKind: string,
    location?: Location['start']
  ): MeldDirectiveError {
    return new MeldDirectiveError(message, directiveKind, location);
  }

  /**
   * Create an embed error with location context
   */
  static createEmbedError(message: string, location?: Location['start']): MeldEmbedError {
    return new MeldEmbedError(message, location);
  }

  /**
   * Adjust a location based on a base location
   * For right-side mode, we need to adjust the line and column numbers
   * based on where the content appears in the parent
   */
  static adjustLocation(location: Location['start'], baseLocation: Location['start']): Location['start'] {
    return {
      line: baseLocation.line + location.line - 1,
      column: location.line === 1 ? baseLocation.column + location.column - 1 : location.column
    };
  }

  /**
   * Create an error with adjusted location for right-side mode
   */
  static createWithAdjustedLocation<T extends MeldError>(
    createFn: (message: string, ...args: any[]) => T,
    message: string,
    location: Location['start'],
    baseLocation: Location['start'],
    ...rest: any[]
  ): T {
    const adjustedLocation = this.adjustLocation(location, baseLocation);
    return createFn(message, ...rest, adjustedLocation);
  }
} 