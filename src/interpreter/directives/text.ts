import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';

export class TextDirectiveHandler implements DirectiveHandler {
  readonly directiveKind = 'text';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === 'text';
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;

    // Validate name parameter
    if (!data.name) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Text directive requires a name parameter',
        node.location,
        context,
        'text'
      );
    }

    // Validate value parameter
    if (data.value === undefined || data.value === null) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Text directive requires a value parameter',
        node.location,
        context,
        'text'
      );
    }

    // Set the text variable
    state.setTextVar(data.name, String(data.value));
  }
}

// Export a singleton instance
export const textDirectiveHandler = new TextDirectiveHandler();