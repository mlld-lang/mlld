import { LocationPoint, Location } from 'meld-spec';
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
  static adjustLocation(location: LocationPoint, baseLocation: LocationPoint): LocationPoint {
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

  static createParseError(message: string, location?: LocationPoint): MeldParseError {
    return new MeldParseError(message, location);
  }

  static createInterpretError(
    message: string,
    directiveKind: string,
    location?: LocationPoint
  ): MeldInterpretError {
    return new MeldInterpretError(message, directiveKind, location);
  }

  static createDirectiveError(
    message: string,
    location?: LocationPoint
  ): MeldDirectiveError {
    return new MeldDirectiveError(message, location);
  }

  static createImportError(message: string, location?: LocationPoint): MeldImportError {
    return new MeldImportError(message, location);
  }

  static createEmbedError(message: string, location?: LocationPoint): MeldEmbedError {
    return new MeldEmbedError(message, location);
  }

  static createDataError(message: string, location?: LocationPoint): MeldDataError {
    return new MeldDataError(message, location);
  }

  static createDefineError(message: string, location?: LocationPoint): MeldDefineError {
    return new MeldDefineError(message, location);
  }

  static createPathError(message: string, location?: LocationPoint): MeldPathError {
    return new MeldPathError(message, location);
  }
} 