import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';
import { adjustLocation } from '../utils/location';

export class CallDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === '@call';
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    if (!data.name) {
      throw new MeldDirectiveError(
        'Call target name is required',
        'call',
        context.mode === 'rightside'
          ? adjustLocation(node.location, context.baseLocation)?.start
          : node.location?.start
      );
    }

    // Get the API definition
    const apiDef = state.getDataVar(`api:${data.name}`);
    if (!apiDef) {
      throw new MeldDirectiveError(
        `API '${data.name}' not found`,
        'call',
        context.mode === 'rightside'
          ? adjustLocation(node.location, context.baseLocation)?.start
          : node.location?.start
      );
    }

    // Store call metadata in state
    state.setDataVar('__pendingCall', {
      api: data.name,
      params: data.params || {},
      location: context.mode === 'rightside'
        ? adjustLocation(node.location, context.baseLocation)
        : node.location
    });
  }
}

export const callDirectiveHandler = new CallDirectiveHandler();