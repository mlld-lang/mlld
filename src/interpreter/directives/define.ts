import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';

export class DefineDirectiveHandler implements DirectiveHandler {
  readonly directiveKind = 'define';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === 'define';
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;

    // Validate name parameter
    if (!data.name) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Define directive requires a name parameter',
        node.location,
        context,
        'define'
      );
    }

    // Validate command parameter
    if (!data.command) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Define directive requires a command parameter',
        node.location,
        context,
        'define'
      );
    }

    // Store the command in state
    state.setCommand(data.name, data.command);
  }
}

// Export a singleton instance
export const defineDirectiveHandler = new DefineDirectiveHandler(); 