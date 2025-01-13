import { Location, MeldNode } from 'meld-spec';
import { InterpreterState } from './state/state';
import { parseMeld } from './parser';
import { interpret } from './interpreter';
import { ErrorFactory } from './errors/factory';
import { interpreterLogger } from '../utils/logger';
import { MeldError } from './errors/errors';

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
 * Interprets sub-directives found within content, returning a child state.
 * Handles proper location adjustments and state inheritance.
 */
export function interpretSubDirectives(
  content: string,
  baseLocation: Location,
  parentState: InterpreterState
): InterpreterState {
  try {
    interpreterLogger.debug('Starting sub-directive interpretation', {
      contentLength: content.length,
      baseLocation
    });

    // Parse the content into nodes
    const nodes = parseMeld(content);
    interpreterLogger.debug('Parsed sub-directives', {
      nodeCount: nodes.length
    });

    // Create child state that inherits from parent
    const childState = new InterpreterState(parentState);
    childState.setCurrentFilePath(parentState.getCurrentFilePath() || '');
    interpreterLogger.debug('Created child state with parent inheritance');

    // Adjust locations for all nodes before interpretation
    for (const node of nodes) {
      adjustNodeLocation(node, baseLocation);
    }

    // Interpret the nodes with proper location context
    interpret(nodes, childState, {
      mode: 'rightside',
      baseLocation,
      parentState
    });

    interpreterLogger.debug('Making child state immutable');
    childState.setImmutable();

    interpreterLogger.info('Sub-directive interpretation completed', {
      nodeCount: childState.getNodes().length,
      vars: {
        text: Array.from(childState.getAllTextVars().keys()),
        data: Array.from(childState.getAllDataVars().keys())
      },
      changes: Array.from(childState.getLocalChanges())
    });

    return childState;
  } catch (error) {
    interpreterLogger.error('Error during sub-directive interpretation', {
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      baseLocation
    });

    if (error instanceof MeldError) {
      throw ErrorFactory.createWithAdjustedLocation(error, baseLocation);
    }
    throw error;
  }
} 