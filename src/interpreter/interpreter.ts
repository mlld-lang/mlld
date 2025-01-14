import { DirectiveNode, MeldNode } from 'meld-spec';
import { directiveRegistry } from './directives/registry';
import { InterpreterState } from './state/state';
import { HandlerContext } from './directives/types';
import { interpreterLogger } from '../utils/logger';
import { ErrorFactory } from './errors/factory';
import { MeldDirectiveError, MeldInterpretError } from './errors/errors';
import { throwWithContext } from './utils/location-helpers';

export async function interpret(
  nodes: MeldNode[],
  state: InterpreterState,
  context: HandlerContext
): Promise<void> {
  // Ensure we have a complete context with defaults
  const mode = context.mode ?? 'toplevel';

  interpreterLogger.info('Starting interpretation', {
    nodeCount: nodes.length,
    mode,
    stateHasParent: !!state.parentState,
    currentNodes: state.getNodes().length,
    baseLocation: context.baseLocation
  });

  // Process each node
  for (const node of nodes) {
    if (node.type === 'Directive') {
      const directiveNode = node as DirectiveNode;
      const newContext = { ...context, mode };

      try {
        await directiveRegistry.handle(directiveNode, state, newContext);
      } catch (error: unknown) {
        if (error instanceof MeldDirectiveError || error instanceof MeldInterpretError) {
          throw error;
        }
        if (error instanceof Error) {
          throwWithContext(
            ErrorFactory.createDirectiveError,
            `Failed to handle directive: ${error.message}`,
            directiveNode.location,
            newContext,
            directiveNode.directive.kind
          );
        }
        throw error;
      }
    }
  }
} 