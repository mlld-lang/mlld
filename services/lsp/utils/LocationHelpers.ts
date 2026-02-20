import { Position } from 'vscode-languageserver/node';
import { SourceLocation } from '@core/types';

export class LocationHelpers {
  static getPosition(location: SourceLocation): Position | null {
    if (!location) return null;

    return {
      line: location.start.line - 1,
      character: location.start.column - 1
    };
  }

  static getEndPosition(location: SourceLocation): Position | null {
    if (!location) return null;

    return {
      line: location.end.line - 1,
      character: location.end.column
    };
  }

  static getLength(location: SourceLocation): number {
    if (!location) return 0;

    if (location.start.line === location.end.line) {
      return location.end.column - location.start.column;
    }

    return 0;
  }

  static adjustPositionForMissingAt(node: { fields?: unknown[] }, position: Position): Position {
    const needsAtAdjustment = node.fields && node.fields.length > 0;
    if (needsAtAdjustment) {
      return {
        ...position,
        character: position.character - 1
      };
    }
    return position;
  }
}