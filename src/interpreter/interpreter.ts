import type { MeldNode, DirectiveNode } from 'meld-spec';
import { DirectiveRegistry } from './directives/registry';
import { InterpreterState } from './state/state';
import { MeldInterpretError } from './errors/errors';

function logNode(node: MeldNode, context: string) {
  console.log(`[Interpreter] ${context}:`, {
    type: node.type,
    hasLocation: !!node.location,
    locationStart: node.location?.start,
    locationEnd: node.location?.end,
    ...(node.type === 'Directive' && {
      directiveKind: (node as DirectiveNode).directive.kind
    })
  });
}

function logError(error: unknown, node: MeldNode) {
  console.error('[Interpreter] Error processing node:', {
    nodeType: node.type,
    errorType: error instanceof Error ? error.constructor.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
    location: node.location
  });
}

/**
 * Interprets a Meld AST
 * @param nodes The AST nodes to interpret
 * @param state The interpreter state
 */
export function interpret(nodes: MeldNode[], state: InterpreterState): void {
  console.log('[Interpreter] Starting interpretation:', {
    nodeCount: nodes?.length ?? 'undefined',
    stateHasParent: !!state.getParentState(),
    currentNodes: state.getNodes().length
  });

  if (!nodes) {
    console.error('[Interpreter] Received null/undefined nodes array');
    throw new MeldInterpretError('Cannot interpret null/undefined nodes', 'Unknown');
  }

  if (!Array.isArray(nodes)) {
    console.error('[Interpreter] Nodes is not an array:', typeof nodes);
    throw new MeldInterpretError('Nodes must be an array', 'Unknown');
  }

  for (const node of nodes) {
    try {
      logNode(node, 'Processing node');

      if (node.type === 'Directive') {
        const directiveNode = node as DirectiveNode;
        console.log('[Interpreter] Processing directive:', {
          kind: directiveNode.directive.kind,
          data: directiveNode.directive
        });

        const handler = DirectiveRegistry.findHandler(directiveNode.directive.kind);
        if (!handler) {
          console.error('[Interpreter] No handler found:', directiveNode.directive.kind);
          throw new MeldInterpretError(
            `No handler found for directive: ${directiveNode.directive.kind}`,
            node.type,
            node.location?.start
          );
        }

        console.log('[Interpreter] Found handler, executing...');
        handler.handle(directiveNode, state);
        console.log('[Interpreter] Handler completed successfully');
      } else {
        console.log('[Interpreter] Adding non-directive node to state');
        state.addNode(node);
      }
    } catch (error) {
      logError(error, node);
      
      if (error instanceof MeldInterpretError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new MeldInterpretError(
        `Failed to interpret node ${node.type}: ${message}`,
        node.type,
        node.location?.start
      );
    }
  }

  console.log('[Interpreter] Interpretation completed:', {
    finalNodeCount: state.getNodes().length,
    stateVars: {
      text: Array.from(state.getAllTextVars().keys()),
      data: Array.from(state.getAllDataVars().keys())
    }
  });
} 