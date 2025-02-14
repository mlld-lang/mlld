import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';

export class DirectiveRegistry {
  private handlers: DirectiveHandler[] = [];

  register(handler: DirectiveHandler): void {
    this.handlers.push(handler);
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const kind = node.directive.kind;
    const handler = this.handlers.find(h => h.canHandle(kind, context.mode));

    if (!handler) {
      directiveLogger.error('No handler found for directive', {
        kind,
        mode: context.mode,
        location: node.location
      });
      throwWithContext(
        ErrorFactory.createDirectiveError,
        `No handler found for directive kind: ${kind}`,
        node.location,
        context
      );
    }

    await handler.handle(node, state, context);
  }
}

// Export a singleton instance
export const directiveRegistry = new DirectiveRegistry(); 