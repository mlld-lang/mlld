import { DirectiveNode, Location, Node } from 'meld-spec';
import { MeldInterpretError } from './errors/errors';
import { InterpreterState } from './state/state';
import { parseMeld } from './parser';
import { interpretMeld } from './interpreter';

function logLocation(node: Node, context: string, baseLocation?: Location) {
  console.log(`[SubInterpreter] ${context}:`, {
    nodeType: node.type,
    originalLocation: node.location ? { ...node.location } : undefined,
    baseLocation,
    hasLocation: !!node.location,
    hasStart: !!node.location?.start,
    hasEnd: !!node.location?.end
  });
}

function logLocationAdjustment(node: Node, baseLocation: Location, adjustedLocation: Location) {
  console.log('[SubInterpreter] Location adjustment:', {
    nodeType: node.type,
    original: node.location,
    base: baseLocation,
    adjusted: adjustedLocation,
    startLineDelta: adjustedLocation.start.line - (node.location?.start.line ?? 0),
    startColumnDelta: adjustedLocation.start.column - (node.location?.start.column ?? 0)
  });
}

function adjustNodeLocation(node: Node, baseLocation: Location): void {
  if (!node.location) {
    console.log('[SubInterpreter] Node missing location, skipping adjustment:', {
      nodeType: node.type
    });
    return;
  }

  logLocation(node, 'Pre-adjustment', baseLocation);

  const startLine = node.location.start.line + baseLocation.start.line - 1;
  const startColumn = node.location.start.line === 1 
    ? node.location.start.column + baseLocation.start.column - 1 
    : node.location.start.column;

  const endLine = node.location.end.line + baseLocation.start.line - 1;
  const endColumn = node.location.end.line === 1 
    ? node.location.end.column + baseLocation.start.column - 1 
    : node.location.end.column;

  const adjustedLocation = {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn }
  };

  logLocationAdjustment(node, baseLocation, adjustedLocation);
  node.location = adjustedLocation;
}

export function interpretSubDirectives(
  content: string,
  baseLocation: Location,
  parentState: InterpreterState
): InterpreterState {
  console.log('[SubInterpreter] Starting interpretation:', {
    contentLength: content.length,
    baseLocation,
    hasParentState: !!parentState,
    parentStateNodes: parentState.getNodes().length
  });

  try {
    // Create child state that inherits from parent
    const childState = new InterpreterState();
    childState.parentState = parentState;

    console.log('[SubInterpreter] Created child state:', {
      hasParentState: !!childState.parentState,
      inheritedVars: {
        text: Array.from(parentState.getAllTextVars().keys()),
        data: Array.from(parentState.getAllDataVars().keys())
      }
    });

    // Parse and interpret sub-directives
    console.log('[SubInterpreter] Parsing content...');
    const nodes = parseMeld(content);
    console.log('[SubInterpreter] Parsed nodes:', {
      count: nodes.length,
      types: nodes.map(n => n.type)
    });

    console.log('[SubInterpreter] Adjusting node locations...');
    nodes.forEach(node => adjustNodeLocation(node, baseLocation));
    
    // Interpret nodes in child state
    console.log('[SubInterpreter] Interpreting nodes in child state...');
    interpretMeld(nodes, childState);

    console.log('[SubInterpreter] Making child state immutable...');
    childState.isImmutable = true;

    console.log('[SubInterpreter] Interpretation completed:', {
      nodeCount: childState.getNodes().length,
      vars: {
        text: Array.from(childState.getAllTextVars().keys()),
        data: Array.from(childState.getAllDataVars().keys())
      }
    });

    return childState;
  } catch (error) {
    console.error('[SubInterpreter] Error during interpretation:', {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      baseLocation
    });

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