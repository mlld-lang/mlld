import { MeldNode, Location } from 'meld-spec';
import { InterpreterState } from './state/state.js';
import { parseMeld } from './interpreter.js';

export interface LocationData {
  line: number;
  column: number;
}

export function interpretSubDirectives(
  content: string,
  parentState: InterpreterState,
  baseLocation?: LocationData
): void {
  try {
    // Parse content into AST
    const nodes = parseMeld(content);

    // Create child state that inherits from parent
    const childState = new InterpreterState(parentState);

    // Adjust node locations based on base location
    if (baseLocation) {
      for (const node of nodes) {
        if (node.location) {
          const lineOffset = baseLocation.line - 1;
          const columnOffset = baseLocation.column - 1;

          // Adjust start position
          node.location.start.line += lineOffset;
          if (node.location.start.line === baseLocation.line) {
            node.location.start.column += columnOffset;
          }

          // Adjust end position
          node.location.end.line += lineOffset;
          if (node.location.end.line === baseLocation.line) {
            node.location.end.column += columnOffset;
          }
        }
      }
    }

    // Process nodes in child state
    for (const node of nodes) {
      childState.addNode(node);
    }

    // Merge child state back to parent
    parentState.mergeFrom(childState);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse or interpret sub-directives: ${error.message}`);
    }
    throw error;
  }
} 