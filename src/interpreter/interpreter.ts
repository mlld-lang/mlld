import type { MeldNode, DirectiveNode, Location } from 'meld-spec';
import { DirectiveRegistry } from './directives/registry';
import { InterpreterState } from './state/state';
import { MeldInterpretError } from './errors/errors';
import { HandlerContext } from './directives/types';

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
 * @param context Optional context for directive handlers. Defaults to top-level mode.
 */
export function interpret(
  nodes: MeldNode[], 
  state: InterpreterState,
  context: Partial<HandlerContext> = { mode: 'toplevel' }
): void {
  console.log('[Interpreter] Starting interpretation:', {
    nodeCount: nodes?.length ?? 'undefined',
    stateHasParent: !!state.getParentState(),
    currentNodes: state.getNodes().length,
    mode: context.mode
  });

  if (!nodes) {
    console.error('[Interpreter] Received null/undefined nodes array');
    throw new MeldInterpretError('Cannot interpret null/undefined nodes', 'Unknown');
  }

  if (!Array.isArray(nodes)) {
    console.error('[Interpreter] Nodes is not an array:', typeof nodes);
    throw new MeldInterpretError('Nodes must be an array', 'Unknown');
  }

  // Ensure we have a complete context with defaults
  const handlerContext: HandlerContext = {
    mode: context.mode ?? 'toplevel',
    parentState: context.parentState ?? state.getParentState(),
    baseLocation: context.baseLocation,
  };

  for (const node of nodes) {
    try {
      logNode(node, 'Processing node');

      if (node.type === 'Directive') {
        const directiveNode = node as DirectiveNode;
        console.log('[Interpreter] Processing directive:', {
          kind: directiveNode.directive.kind,
          data: directiveNode.directive,
          mode: handlerContext.mode
        });

        const handler = DirectiveRegistry.findHandler(directiveNode.directive.kind, handlerContext.mode);
        if (!handler) {
          console.error('[Interpreter] No handler found:', directiveNode.directive.kind);
          throw new MeldInterpretError(
            `No handler found for directive: ${directiveNode.directive.kind}`,
            node.type,
            node.location?.start
          );
        }

        console.log('[Interpreter] Found handler, executing...');
        handler.handle(directiveNode, state, handlerContext);
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