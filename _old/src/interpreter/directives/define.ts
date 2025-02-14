import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';

export class DefineDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'define';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === DefineDirectiveHandler.directiveKind;
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    directiveLogger.debug('Processing define directive', {
      name: data.name,
      mode: context.mode,
      location: node.location
    });

    // Validate name parameter
    if (!data.name || typeof data.name !== 'string') {
      directiveLogger.error('Define directive missing name', {
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createDefineError,
        'Define directive requires a name parameter',
        node.location,
        context
      );
    }

    // Store definition in state
    state.setTextVar(data.name, data.value || '');

    directiveLogger.info('Definition stored successfully', {
      name: data.name,
      mode: context.mode
    });
  }
}

// Export a singleton instance
export const defineDirectiveHandler = new DefineDirectiveHandler(); 