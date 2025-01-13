import { DirectiveNode, MeldNode } from 'meld-spec';
import { DirectiveRegistry } from './directives/registry';
import { InterpreterState } from './state/state';
import { HandlerContext } from './directives/types';

function logStateOp(op: string, details?: Record<string, unknown>): void {
  console.log(`[${new Date().toISOString()}] Interpreter ${op}`, details);
}

export async function interpret(
  nodes: MeldNode[],
  state: InterpreterState,
  context: HandlerContext
): Promise<void> {
  // Ensure we have a complete context with defaults
  const mode = context.mode ?? 'toplevel';

  logStateOp('interpret start', {
    mode,
    stateHasParent: !!state.parentState,
    currentNodes: state.getNodes().length,
    baseLocation: context.baseLocation
  });

  // Create new context with parent state
  const newContext: HandlerContext = {
    mode,
    baseLocation: context.baseLocation,
    parentState: context.parentState ?? state.parentState,
    currentPath: context.currentPath
  };

  // Process each node
  for (const node of nodes) {
    if (node.type === 'Directive') {
      const directiveNode = node as DirectiveNode;
      try {
        logStateOp('processing directive', {
          kind: directiveNode.directive.kind,
          data: directiveNode.directive,
          mode: newContext.mode
        });

        const handler = DirectiveRegistry.findHandler(directiveNode.directive.kind, newContext.mode);
        if (!handler) {
          console.error('[Interpreter] No handler found:', directiveNode.directive.kind);
          continue;
        }

        console.log('[Interpreter] Found handler, executing...');
        await handler.handle(directiveNode, state, newContext);
        console.log('[Interpreter] Handler completed successfully');
      } catch (error) {
        console.error('[Interpreter] Error handling directive:', error);
        throw error;
      }
    } else {
      state.addNode(node);
    }
  }

  logStateOp('interpret complete', {
    finalNodeCount: state.getNodes().length,
    vars: {
      text: Array.from(state.getAllTextVars().keys()),
      data: Array.from(state.getAllDataVars().keys())
    }
  });
} 