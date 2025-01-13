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

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    directiveLogger.debug('Processing define directive', {
      name: data.name,
      mode: context.mode,
      location: node.location
    });

    if (!data.name) {
      directiveLogger.error('Define directive missing name', {
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Define directive requires a name',
        node.location,
        context,
        'define'
      );
    }

    if (!data.value) {
      directiveLogger.error('Define directive missing value', {
        name: data.name,
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Define directive requires a value',
        node.location,
        context,
        'define'
      );
    }

    directiveLogger.info(`Defining command: ${data.name}`, {
      options: data.options,
      mode: context.mode
    });

    // Store the command in state
    state.setCommand(data.value, data.name, data.options);
  }
}

export const defineDirectiveHandler = new DefineDirectiveHandler(); 