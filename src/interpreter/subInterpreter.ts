import { DirectiveNode, Location, Node } from 'meld-spec';
import { MeldInterpretError } from './errors/errors.js';
import { InterpreterState } from './state/state.js';
import { parseMeld } from './parser.js';
import { interpretMeld } from './interpreter.js';

function adjustNodeLocation(node: Node, baseLocation: Location): void {
  if (!node.location) return;

  const startLine = node.location.start.line + baseLocation.start.line - 1;
  const startColumn = node.location.start.line === 1 
    ? node.location.start.column + baseLocation.start.column - 1 
    : node.location.start.column;

  const endLine = node.location.end.line + baseLocation.start.line - 1;
  const endColumn = node.location.end.line === 1 
    ? node.location.end.column + baseLocation.start.column - 1 
    : node.location.end.column;

  node.location = {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn }
  };
}

export function interpretSubDirectives(
  content: string,
  baseLocation: Location,
  parentState: InterpreterState
): InterpreterState {
  try {
    // Create child state that inherits from parent
    const childState = new InterpreterState();
    childState.parentState = parentState;

    // Parse and interpret sub-directives
    const nodes = parseMeld(content);
    nodes.forEach(node => adjustNodeLocation(node, baseLocation));
    
    // Interpret nodes in child state
    interpretMeld(nodes, childState);

    // Make child state immutable before merging back to parent
    childState.isImmutable = true;
    return childState;
  } catch (error) {
    if (error instanceof Error) {
      throw new MeldInterpretError(
        `Failed to parse or interpret sub-directives: ${error.message}`,
        'SubDirective',
        baseLocation.start
      );
    }
    throw error;
  }
} 