import type { MeldNode } from 'meld-spec';
import { InterpreterState } from './state/state.js';
import { parseMeldContent } from './parser.js';
import { interpret } from './interpreter.js';

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
    const nodes = parseMeldContent(content);

    // Adjust node locations if base location is provided
    if (baseLocation) {
      for (const node of nodes) {
        if (node.location) {
          node.location.start.line += baseLocation.line - 1;
          node.location.end.line += baseLocation.line - 1;
          if (node.location.start.line === baseLocation.line) {
            node.location.start.column += baseLocation.column - 1;
          }
          if (node.location.end.line === baseLocation.line) {
            node.location.end.column += baseLocation.column - 1;
          }
        }
      }
    }

    // Create child state with parent state and base location
    const childState = new InterpreterState({
      parentState,
      baseLocation
    });

    // Process all nodes in child state
    interpret(nodes, childState);

    // Merge child state back to parent
    parentState.mergeChildState(childState);
  } catch (error) {
    // Re-throw with original error message
    throw error;
  }
} 