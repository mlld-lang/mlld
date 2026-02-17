import { Position } from 'vscode-languageserver/node';

export class LocationHelpers {
  static getPosition(location: any): Position | null {
    if (!location) return null;
    
    return {
      line: location.start.line - 1,
      character: location.start.column - 1
    };
  }
  
  static getEndPosition(location: any): Position | null {
    if (!location) return null;
    
    return {
      line: location.end.line - 1,
      character: location.end.column
    };
  }
  
  static getLength(location: any): number {
    if (!location) return 0;
    
    if (location.start.line === location.end.line) {
      return location.end.column - location.start.column;
    }
    
    return 0;
  }
  
  static adjustPositionForMissingAt(node: any, position: Position): Position {
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