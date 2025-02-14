import { Location } from 'meld-spec';
import {
  MeldError,
  MeldParseError,
  MeldInterpretError,
  MeldDirectiveError,
  MeldImportError,
  MeldEmbedError,
  MeldDataError,
  MeldDefineError,
  MeldPathError
} from './errors';

export class ErrorFactory {
  static adjustLocation(location: Location['start'], baseLocation: Location['start']): Location['start'] {
    return {
      line: location.line + baseLocation.line - 1,
      column: location.line === 1 ? location.column + baseLocation.column - 1 : location.column
    };
  }

  static createWithAdjustedLocation(error: MeldError, baseLocation: Location): MeldError {
    if (!error.location || !baseLocation) return error;
    error.location = this.adjustLocation(error.location, baseLocation.start);
    return error;
  }

  static createParseError(message: string, location?: Location['start']): MeldParseError {
    return new MeldParseError(message, location);
  }

  static createInterpretError(
    message: string,
    directiveKind: string,
    location?: Location['start']
  ): MeldInterpretError {
    return new MeldInterpretError(message, directiveKind, location);
  }

  static createDirectiveError(
    message: string,
    directiveKind: string,
    location?: Location['start']
  ): MeldDirectiveError {
    return new MeldDirectiveError(message, directiveKind, location);
  }

  static createImportError(message: string, location?: Location['start']): MeldImportError {
    return new MeldImportError(message, location);
  }

  static createEmbedError(message: string, location?: Location['start']): MeldEmbedError {
    return new MeldEmbedError(message, location);
  }

  static createDataError(message: string, location?: Location['start']): MeldDataError {
    return new MeldDataError(message, location);
  }

  static createDefineError(message: string, location?: Location['start']): MeldDefineError {
    return new MeldDefineError(message, location);
  }

  static createPathError(message: string, location?: Location['start']): MeldPathError {
    return new MeldPathError(message, location);
  }
} 