import type { MeldNode, DirectiveNode } from 'meld-spec';
import { DirectiveRegistry } from './directives/registry';
import { InterpreterState } from './state/state';
import { MeldInterpretError } from './errors/errors';

/**
 * Interprets a Meld AST
 * @param nodes The AST nodes to interpret
 * @param state The interpreter state
 */
export function interpret(nodes: MeldNode[], state: InterpreterState): void {
  for (const node of nodes) {
    try {
      if (node.type === 'Directive') {
        const directiveNode = node as DirectiveNode;
        const handler = DirectiveRegistry.findHandler(directiveNode.directive.kind);
        if (!handler) {
          throw new MeldInterpretError(
            `No handler found for directive: ${directiveNode.directive.kind}`,
            node.type,
            node.location?.start
          );
        }
        handler.handle(directiveNode, state);
      } else {
        // Store non-directive nodes in state
        state.addNode(node);
      }
    } catch (error) {
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
} 