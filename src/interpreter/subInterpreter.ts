import { MeldNode, Location } from 'meld-spec';
import { InterpreterState } from './state/state.js';
import { parseMeldContent } from './parser.js';
import { interpret } from './interpreter.js';

/**
 * Interprets a string of meld content within the context of a parent state.
 * The content is parsed into nodes, interpreted with a child state that inherits from the parent,
 * and then the child state is merged back into the parent.
 */
export function interpretSubDirectives(
  content: string,
  parentState: InterpreterState,
  baseLocation?: Location['start']
): void {
  try {
    // Parse content into nodes
    const nodes = parseMeldContent(content);

    // Create child state that inherits from parent
    const childState = new InterpreterState(parentState);

    // Interpret nodes in child state
    interpret(nodes, childState);

    // Adjust node locations based on base location
    if (baseLocation) {
      childState.getNodes().forEach(node => {
        if (node.location) {
          if (node.location.start) {
            node.location.start.line += baseLocation.line - 1;
            if (node.location.start.line === baseLocation.line) {
              node.location.start.column += baseLocation.column - 1;
            }
          }
          if (node.location.end) {
            node.location.end.line += baseLocation.line - 1;
            if (node.location.end.line === baseLocation.line) {
              node.location.end.column += baseLocation.column - 1;
            }
          }
        }
      });
    }

    // Merge child state back to parent
    childState.getAllTextVars().forEach((value, key) => {
      parentState.setTextVar(key, value);
    });
    childState.getAllDataVars().forEach((value, key) => {
      parentState.setDataVar(key, value);
    });
    childState.getAllCommands().forEach((value, key) => {
      parentState.setCommand(key, value);
    });

    // Add nodes from child state to parent
    childState.getNodes().forEach(node => {
      parentState.addNode(node);
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse or interpret sub-directives: ${error.message}`);
    }
    throw error;
  }
} 