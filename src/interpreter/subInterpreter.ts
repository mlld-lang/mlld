import { Location, MeldNode } from 'meld-spec';
import { InterpreterState } from './state/state';
import { parseMeld } from './parser';
import { interpret } from './interpreter';
import { ErrorFactory } from './errors/factory';

/**
 * Adjusts the location of a node and all its children based on a base location.
 * This handles multi-line content by properly calculating line offsets.
 */
function adjustNodeLocation(node: MeldNode, baseLocation: Location): void {
  if (!node.location) return;

  // Calculate line offset based on base location
  const lineOffset = baseLocation.start.line - 1;
  
  // For the first line, we need to add the base column offset
  if (node.location.start.line === 1) {
    node.location.start.column += baseLocation.start.column - 1;
  }
  node.location.start.line += lineOffset;

  if (node.location.end) {
    if (node.location.end.line === 1) {
      node.location.end.column += baseLocation.start.column - 1;
    }
    node.location.end.line += lineOffset;
  }

  // Recursively adjust locations of any child nodes
  if ('nodes' in node) {
    for (const childNode of (node as any).nodes) {
      adjustNodeLocation(childNode, baseLocation);
    }
  }
}

/**
 * Creates an error with properly adjusted location information.
 */
function createLocationAwareError(
  error: Error,
  baseLocation: Location,
  nodeType: string = 'SubDirective'
): Error {
  if ('location' in error && error.location) {
    return ErrorFactory.createWithAdjustedLocation(
      ErrorFactory.createInterpretError,
      `Failed to parse or interpret sub-directives: ${error.message}`,
      (error.location as Location).start,
      baseLocation.start,
      nodeType
    );
  } else {
    return ErrorFactory.createInterpretError(
      `Failed to parse or interpret sub-directives: ${error.message}`,
      nodeType,
      baseLocation.start
    );
  }
}

/**
 * Interprets sub-directives found within content, returning a child state.
 * Handles proper location adjustments and state inheritance.
 */
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
    const childState = new InterpreterState(parentState);
    childState.setCurrentFilePath(parentState.getCurrentFilePath() || '');

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

    // Adjust locations for all nodes before interpretation
    for (const node of nodes) {
      adjustNodeLocation(node, baseLocation);
    }

    // Interpret nodes in child state with right-side context
    console.log('[SubInterpreter] Interpreting nodes in child state...');
    interpret(nodes, childState, {
      mode: 'rightside',
      parentState,
      baseLocation
    });

    // Merge child state back to parent before making it immutable
    console.log('[SubInterpreter] Merging child state back to parent...');
    if (!parentState.isImmutable) {
      // Merge child state back to all parent states in the chain
      let currentParent: InterpreterState | undefined = parentState;
      
      // Merge child state into each parent state in the chain
      while (currentParent && !currentParent.isImmutable) {
        console.log('[SubInterpreter] Merging child state into parent:', {
          parentVars: Array.from(currentParent.getAllTextVars().keys()),
          childVars: Array.from(childState.getLocalTextVars().keys()),
          childChanges: Array.from(childState.getLocalChanges())
        });
        currentParent.mergeChildState(childState);
        currentParent = currentParent.parentState;
      }
    }

    console.log('[SubInterpreter] Making child state immutable...');
    childState.setImmutable();

    console.log('[SubInterpreter] Interpretation completed:', {
      nodeCount: childState.getNodes().length,
      vars: {
        text: Array.from(childState.getAllTextVars().keys()),
        data: Array.from(childState.getAllDataVars().keys())
      },
      changes: Array.from(childState.getLocalChanges())
    });

    return childState;
  } catch (error) {
    console.error('[SubInterpreter] Error during interpretation:', {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      baseLocation
    });

    if (error instanceof Error) {
      throw createLocationAwareError(error, baseLocation);
    }
    throw error;
  }
} 