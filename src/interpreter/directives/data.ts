import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';

export class DataDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'data';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === DataDirectiveHandler.directiveKind;
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    if (!data.name) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Data directive requires a name',
        node.location,
        context,
        'data'
      );
    }

    if (!data.value) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Data directive requires a value',
        node.location,
        context,
        'data'
      );
    }

    state.setDataVar(data.name, data.value);
  }
}

export const dataDirectiveHandler = new DataDirectiveHandler();