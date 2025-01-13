import { Location } from 'meld-spec';
import { HandlerContext } from '../directives/types';
import { ErrorFactory } from '../errors/factory';

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

/**
 * Throws an error with proper location adjustment based on context
 */
export function throwWithContext(
  createErrorFn: typeof ErrorFactory.createDirectiveError,
  message: string,
  nodeLocation: Location | undefined,
  context: HandlerContext,
  directiveKind: string
): never {
  const error = createErrorFn(message, directiveKind, nodeLocation?.start);
  
  if (context.mode === 'rightside' && nodeLocation && context.baseLocation) {
    throw ErrorFactory.createWithAdjustedLocation(
      () => error,
      message,
      nodeLocation.start,
      context.baseLocation.start,
      directiveKind
    );
  }
  throw error;
} 