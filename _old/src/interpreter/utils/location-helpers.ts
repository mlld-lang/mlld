import { Location } from 'meld-spec';
import { HandlerContext } from '../directives/types';
import { ErrorFactory } from '../errors/factory';
import { MeldDirectiveError, MeldError } from '../errors/errors';
import { LocationPoint } from '../errors/types';

/**
 * Adjusts a location based on the context if in rightside mode
 */
export function maybeAdjustLocation(
  location: Location | undefined,
  context: HandlerContext
): Location | undefined {
  if (context.mode === 'rightside' && location && context.baseLocation) {
    return {
      start: ErrorFactory.adjustLocation(location.start, context.baseLocation.start),
      end: ErrorFactory.adjustLocation(location.end, context.baseLocation.start)
    };
  }
  return location;
}

type ErrorCreator = (message: string, ...args: any[]) => MeldError;

/**
 * Throws an error with proper location adjustment based on context
 */
export function throwWithContext(
  createErrorFn: ErrorCreator,
  message: string,
  nodeLocation: Location | undefined,
  context: HandlerContext,
  directiveKind?: string
): never {
  let error: MeldError;
  
  if (directiveKind && createErrorFn === ErrorFactory.createDirectiveError) {
    error = ErrorFactory.createDirectiveError(message, directiveKind, nodeLocation?.start);
  } else {
    error = createErrorFn(message, nodeLocation?.start);
  }

  if (context.mode === 'rightside' && nodeLocation && context.baseLocation) {
    throw ErrorFactory.createWithAdjustedLocation(error, {
      start: context.baseLocation.start,
      end: context.baseLocation.start
    });
  }
  throw error;
} 