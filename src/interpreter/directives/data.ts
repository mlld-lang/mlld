import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';

export class DataDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'data';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === DataDirectiveHandler.directiveKind;
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    directiveLogger.debug('Processing data directive', {
      name: data.name,
      mode: context.mode,
      location: node.location
    });

    // Validate name parameter
    if (!data.name || typeof data.name !== 'string') {
      directiveLogger.error('Data directive missing name', {
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createDataError,
        'Data directive requires a name parameter',
        node.location,
        context
      );
    }

    // Store data in state
    state.setDataVar(data.name, data.value);

    directiveLogger.info('Data stored successfully', {
      name: data.name,
      mode: context.mode
    });
  }
}

// Export a singleton instance
export const dataDirectiveHandler = new DataDirectiveHandler();