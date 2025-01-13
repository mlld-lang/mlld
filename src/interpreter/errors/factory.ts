import { Location, LocationPoint } from 'meld-spec';
import {
  MeldError,
  MeldParseError,
  MeldInterpretError,
  MeldImportError,
  MeldDirectiveError,
  MeldEmbedError
} from './errors';
import { interpreterLogger } from '../../utils/logger';

/**
 * Create a parse error with location information
 */
export function createParseError(message: string, location?: LocationPoint): MeldParseError {
  interpreterLogger.error('Parse error occurred', {
    message,
    location
  });
  return new MeldParseError(message, location);
}

/**
 * Create an interpret error with location information
 */
export function createInterpretError(
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
}

/**
 * Create an import error with location information
 */
export function createImportError(message: string, location?: LocationPoint): MeldImportError {
  interpreterLogger.error('Import error occurred', {
    message,
    location
  });
  return new MeldImportError(message, location);
}

/**
 * Create a directive error with location information
 */
export function createDirectiveError(message: string, location?: LocationPoint): MeldDirectiveError {
  interpreterLogger.error('Directive error occurred', {
    message,
    location
  });
  return new MeldDirectiveError(message, location);
}

/**
 * Create an embed error with location information
 */
export function createEmbedError(message: string, location?: LocationPoint): MeldEmbedError {
  interpreterLogger.error('Embed error occurred', {
    message,
    location
  });
  return new MeldEmbedError(message, location);
}

/**
 * Create a location-aware error by adjusting the location based on a base location
 */
export function createLocationAwareError(error: MeldError, baseLocation: Location): MeldError {
  if (!error.location || !baseLocation.start) {
    interpreterLogger.warn('Cannot create location-aware error - missing location information', {
      hasErrorLocation: !!error.location,
      hasBaseLocation: !!baseLocation.start
    });
    return error;
  }

  const newLocation = {
    line: error.location.line + baseLocation.start.line - 1,
    column: error.location.line === 1 
      ? error.location.column + baseLocation.start.column - 1
      : error.location.column
  };

  interpreterLogger.debug('Created location-aware error', {
    originalLocation: error.location,
    baseLocation: baseLocation.start,
    adjustedLocation: newLocation
  });

  error.location = newLocation;
  return error;
} 