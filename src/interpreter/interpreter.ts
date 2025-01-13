import { DirectiveNode, MeldNode } from 'meld-spec';
import { DirectiveRegistry } from './directives/registry';
import { InterpreterState } from './state/state';
import { HandlerContext } from './directives/types';
import { interpreterLogger } from '../utils/logger';
import { ErrorFactory } from './errors/factory';

export async function interpret(
  nodes: MeldNode[],
  state: InterpreterState,
  context: HandlerContext
): Promise<void> {
  // Ensure we have a complete context with defaults
  const mode = context.mode ?? 'toplevel';

  interpreterLogger.info('Starting interpretation', {
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
        interpreterLogger.debug('Processing directive', {
          kind: directiveNode.directive.kind,
          data: directiveNode.directive,
          mode: newContext.mode,
          location: directiveNode.location
        });

        const handler = DirectiveRegistry.findHandler(directiveNode.directive.kind, newContext.mode);
        if (!handler) {
          interpreterLogger.error('No handler found for directive', {
            kind: directiveNode.directive.kind,
            mode: newContext.mode
          });
          throw ErrorFactory.createInterpretError(
            `No handler found for directive '${directiveNode.directive.kind}'`,
            directiveNode.directive.kind,
            directiveNode.location ? directiveNode.location.start : undefined
          );
        }

        interpreterLogger.debug('Executing directive handler', {
          kind: directiveNode.directive.kind,
          handler: handler.constructor.name
        });
        await handler.handle(directiveNode, state, newContext);
        interpreterLogger.debug('Handler execution completed', {
          kind: directiveNode.directive.kind,
          handler: handler.constructor.name
        });
      } catch (error) {
        interpreterLogger.error('Error handling directive', {
          kind: directiveNode.directive.kind,
          error: error instanceof Error ? error.message : String(error),
          location: directiveNode.location
        });
        throw error;
      }
    } else {
      interpreterLogger.debug('Adding non-directive node', {
        type: node.type,
        location: node.location
      });
      state.addNode(node);
    }
  }

  interpreterLogger.info('Interpretation completed', {
    finalNodeCount: state.getNodes().length,
    vars: {
      text: Array.from(state.getAllTextVars().keys()),
      data: Array.from(state.getAllDataVars().keys())
    },
    changes: Array.from(state.getLocalChanges())
  });
} 