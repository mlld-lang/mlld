import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';

export class DataDirectiveHandler implements DirectiveHandler {
  readonly directiveKind = 'data';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === 'data';
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;

    // Validate name parameter
    if (!data.name) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Data directive requires a name parameter',
        node.location,
        context,
        'data'
      );
    }

    // Validate value parameter
    if (data.value === undefined || data.value === null) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Data directive requires a value parameter',
        node.location,
        context,
        'data'
      );
    }

    // Set the data variable
    state.setDataVar(data.name, data.value);
  }
}

// Export a singleton instance
export const dataDirectiveHandler = new DataDirectiveHandler();