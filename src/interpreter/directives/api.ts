import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';
import { adjustLocation } from '../utils/location';

export class ApiDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === '@api';
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    if (!data.name) {
      throw new MeldDirectiveError(
        'API name is required',
        'api',
        context.mode === 'rightside'
          ? adjustLocation(node.location, context.baseLocation)?.start
          : node.location?.start
      );
    }

    // Store API definition in state
    state.setDataVar(`api:${data.name}`, data);
  }
}

export const apiDirectiveHandler = new ApiDirectiveHandler();