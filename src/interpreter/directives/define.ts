import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';

export class DefineDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'define';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === DefineDirectiveHandler.directiveKind;
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    if (!data.name) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Define directive requires a name',
        node.location,
        context,
        'define'
      );
    }

    if (!data.value) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Define directive requires a value',
        node.location,
        context,
        'define'
      );
    }

    // Store the command in state
    state.setCommand(data.value, data.name, data.options);
  }
}

export const defineDirectiveHandler = new DefineDirectiveHandler(); 