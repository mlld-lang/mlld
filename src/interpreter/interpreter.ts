import type { MeldNode, DirectiveNode } from 'meld-spec';
import { DirectiveRegistry } from './directives/registry.js';
import { InterpreterState } from './state/state.js';

/**
 * Interprets a Meld AST
 * @param nodes The AST nodes to interpret
 * @param state The interpreter state
 */
export function interpret(nodes: MeldNode[], state: InterpreterState): void {
  for (const node of nodes) {
    try {
      switch (node.type) {
        case 'Text':
          // Store text nodes in state (includes comments)
          state.addNode(node);
          break;

        case 'CodeFence':
          // Store code fence nodes in state
          state.addNode(node);
          break;

        case 'Directive': {
          // Cast to DirectiveNode since we know it's a directive
          const directiveNode = node as DirectiveNode;
          // Find handler for directive kind
          const handler = DirectiveRegistry.findHandler(directiveNode.directive.kind);
          if (!handler) {
            throw new Error(`No handler found for directive: ${directiveNode.directive.kind}`);
          }
          // Handle directive
          handler.handle(directiveNode, state);
          break;
        }

        default:
          // Store unknown node types in state
          state.addNode(node);
          break;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const err = new Error(`Failed to interpret node ${node.type}: ${message}`);
      if (error instanceof Error) {
        err.cause = error;
      }
      throw err;
    }
  }
} 