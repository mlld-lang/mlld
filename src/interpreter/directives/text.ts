import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './index.js';
import { InterpreterState } from '../state/state.js';
import { MeldDirectiveError } from '../errors/errors.js';

interface TextDirectiveData {
  kind: 'text';
  identifier: string;
  value: string | string[];
}

/**
 * Handler for @text directives
 */
export class TextDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === 'text';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive as TextDirectiveData;
    
    if (!data.identifier) {
      throw new MeldDirectiveError(
        'Text directive requires an identifier',
        'text',
        node.location?.start
      );
    }

    if (data.value === undefined) {
      throw new MeldDirectiveError(
        'Text directive requires a value',
        'text',
        node.location?.start
      );
    }

    // Handle string concatenation with array values
    const value = Array.isArray(data.value) ? data.value.join('') : data.value;
    
    // Store the value in state
    state.setTextVar(data.identifier, value);
  }
} 