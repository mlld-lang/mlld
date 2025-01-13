import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext, maybeAdjustLocation } from '../utils/location-helpers';

export class TextDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'text';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === TextDirectiveHandler.directiveKind;
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    
    // Validate name parameter
    if (!data.name || typeof data.name !== 'string') {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Text directive requires a name parameter',
        node.location,
        context,
        'text'
      );
    }

    // Handle value - ensure it's a string and handle undefined/null
    const value = data.value !== undefined && data.value !== null ? String(data.value) : '';
    
    // Store in state with proper location tracking
    state.setTextVar(data.name, value);
  }
}

export const textDirectiveHandler = new TextDirectiveHandler();