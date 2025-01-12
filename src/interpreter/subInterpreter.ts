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

    // Create child state with parent state and base location
    const childState = new InterpreterState({
      parentState,
      baseLocation
    });

    // Process all nodes in child state
    interpret(nodes, childState);

    // Adjust node locations if base location is provided
    if (baseLocation) {
      for (const node of childState.getNodes()) {
        if (node.location) {
          // Adjust start position
          if (node.location.start) {
            node.location.start = {
              line: baseLocation.line,
              column: baseLocation.column + (node.location.start.column - 1)
            };
          }
          
          // Adjust end position
          if (node.location.end) {
            node.location.end = {
              line: baseLocation.line,
              column: baseLocation.column + (node.location.end.column - 1)
            };
          }
        }
      }
    }

    // Merge child state back to parent
    parentState.mergeChildState(childState);
  } catch (error) {
    // Re-throw with original error message
    throw error;
  }
} 