import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './index.js';
import { InterpreterState } from '../state/state.js';
import { MeldDirectiveError } from '../errors/errors.js';

interface TextDirectiveData {
  kind: 'text';
  name: string;
  value: string;
}

/**
 * Handler for @text directives
 */
class TextDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === 'text';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive as TextDirectiveData;
    
    if (!data.name) {
      throw new MeldDirectiveError(
        'Text directive requires a name',
        'text',
        node.location?.start
      );
    }

    if (!data.value) {
      throw new MeldDirectiveError(
        'Text directive requires a value',
        'text',
        node.location?.start
      );
    }

    // Store the text in state
    state.setTextVar(data.name, data.value);
  }
}

export const textDirectiveHandler = new TextDirectiveHandler(); 