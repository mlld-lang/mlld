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

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    directiveLogger.debug('Processing data directive', {
      name: data.name,
      mode: context.mode,
      location: node.location
    });

    if (!data.name) {
      directiveLogger.error('Data directive missing name parameter', {
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Data directive requires a name',
        node.location,
        context,
        'data'
      );
    }

    if (!data.value) {
      directiveLogger.error('Data directive missing value parameter', {
        name: data.name,
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Data directive requires a value',
        node.location,
        context,
        'data'
      );
    }

    directiveLogger.info(`Setting data variable: ${data.name}`, {
      value: data.value,
      mode: context.mode
    });
    state.setDataVar(data.name, data.value);
  }
}

export const dataDirectiveHandler = new DataDirectiveHandler();