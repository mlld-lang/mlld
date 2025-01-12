import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';
import { adjustLocation } from '../utils/location';

export class DataDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === '@data';
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    if (!data.name) {
      throw new MeldDirectiveError(
        'Data directive requires a name',
        'data',
        context.mode === 'rightside'
          ? adjustLocation(node.location, context.baseLocation)?.start
          : node.location?.start
      );
    }

    if (!data.value) {
      throw new MeldDirectiveError(
        'Data directive requires a value',
        'data',
        context.mode === 'rightside'
          ? adjustLocation(node.location, context.baseLocation)?.start
          : node.location?.start
      );
    }

    state.setDataVar(data.name, data.value);
  }
}

export const dataDirectiveHandler = new DataDirectiveHandler();