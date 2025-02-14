import { Location } from 'meld-spec';

/**
 * Adjusts a location relative to a base location
 */
export function adjustLocation(
  location: Location | undefined,
  baseLocation: Location | undefined
): Location | undefined {
  if (!location || !baseLocation) {
    return undefined;
  }

  const baseLine = baseLocation.start.line;
  const baseColumn = baseLocation.start.column;

  return {
    start: {
      line: baseLine + (location.start.line - 1),
      column: location.start.line === 1 ? baseColumn + location.start.column - 1 : location.start.column
    },
    end: {
      line: baseLine + (location.end.line - 1),
      column: location.end.line === 1 ? baseColumn + location.end.column - 1 : location.end.column
    }
  };
} 