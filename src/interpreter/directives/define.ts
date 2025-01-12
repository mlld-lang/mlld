import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';
import { adjustLocation } from '../utils/location';

export class DefineDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === '@define';
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    if (!data.name) {
      throw new MeldDirectiveError(
        'Define directive requires a name',
        'define',
        context.mode === 'rightside'
          ? adjustLocation(node.location, context.baseLocation)?.start
          : node.location?.start
      );
    }

    if (!data.value) {
      throw new MeldDirectiveError(
        'Define directive requires a value',
        'define',
        context.mode === 'rightside'
          ? adjustLocation(node.location, context.baseLocation)?.start
          : node.location?.start
      );
    }

    // Store the definition in state
    state.setDataVar(`define:${data.name}`, {
      name: data.name,
      value: data.value,
      location: context.mode === 'rightside'
        ? adjustLocation(node.location, context.baseLocation)
        : node.location
    });
  }
}

export const defineDirectiveHandler = new DefineDirectiveHandler(); 