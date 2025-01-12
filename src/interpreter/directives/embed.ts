import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';
import { interpretSubDirectives } from '../subInterpreter';
import { adjustLocation } from '../utils/location';

export class EmbedDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === '@embed';
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    if (!data.content) {
      throw new MeldDirectiveError(
        'Embed directive requires content',
        'embed',
        context.mode === 'rightside'
          ? adjustLocation(node.location, context.baseLocation)?.start
          : node.location?.start
      );
    }

    // Get the location for sub-directives
    const embedLocation = context.mode === 'rightside'
      ? adjustLocation(node.location, context.baseLocation)
      : node.location;

    if (!embedLocation) {
      throw new MeldDirectiveError(
        'Embed directive requires a valid location',
        'embed',
        context.mode === 'rightside'
          ? adjustLocation(node.location, context.baseLocation)?.start
          : node.location?.start
      );
    }

    // Interpret sub-directives with the embed location as base
    const childState = interpretSubDirectives(
      data.content,
      embedLocation,
      state
    );

    // Store any results in parent state
    for (const [key, value] of childState.getAllTextVars()) {
      state.setTextVar(key, value);
    }
    for (const [key, value] of childState.getAllDataVars()) {
      state.setDataVar(key, value);
    }
  }
}

export const embedDirectiveHandler = new EmbedDirectiveHandler();