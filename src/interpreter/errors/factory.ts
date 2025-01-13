import { Location } from 'meld-spec';
import { LocationPoint } from './types';
import {
  MeldError,
  MeldParseError,
  MeldInterpretError,
  MeldImportError,
  MeldDirectiveError,
  MeldEmbedError
} from './errors';
import { interpreterLogger } from '../../utils/logger';

export const ErrorFactory = {
  adjustLocation(location: LocationPoint, baseLocation: LocationPoint): LocationPoint {
    return {
      line: location.line + baseLocation.line - 1,
      column: location.line === 1 
        ? location.column + baseLocation.column - 1
        : location.column
    };
  },

  createWithAdjustedLocation(error: MeldError, baseLocation: Location): MeldError {
    if (!error.location || !baseLocation.start) {
      interpreterLogger.warn('Cannot create location-aware error - missing location information', {
        hasErrorLocation: !!error.location,
        hasBaseLocation: !!baseLocation.start
      });
      return error;
    }

    const newLocation = this.adjustLocation(error.location, baseLocation.start);
    error.location = newLocation;
    return error;
  },

  createParseError(message: string, location?: LocationPoint): MeldParseError {
    interpreterLogger.error('Parse error occurred', {
      message,
      location
    });
    return new MeldParseError(message, location);
  },

  createInterpretError(
    message: string,
    nodeType?: string,
    location?: LocationPoint
  ): MeldInterpretError {
    interpreterLogger.error('Interpret error occurred', {
      message,
      nodeType,
      location
    });
    return new MeldInterpretError(message, nodeType, location);
  },

  createImportError(message: string, location?: LocationPoint): MeldImportError {
    interpreterLogger.error('Import error occurred', {
      message,
      location
    });
    return new MeldImportError(message, location);
  },

  createDirectiveError(message: string, directiveKind: string, location?: LocationPoint): MeldDirectiveError {
    interpreterLogger.error('Directive error occurred', {
      message,
      directiveKind,
      location
    });
    return new MeldDirectiveError(message, directiveKind, location);
  },

  createEmbedError(message: string, location?: LocationPoint): MeldEmbedError {
    interpreterLogger.error('Embed error occurred', {
      message,
      location
    });
    return new MeldEmbedError(message, location);
  }
}; 