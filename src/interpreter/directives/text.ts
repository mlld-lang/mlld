import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';

interface TextDirectiveData {
  kind: '@text';
  name: string;
  value: string | string[];
}

/**
 * Handler for @text directives
 */
class TextDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === '@text';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive;
    
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

    let value = data.value;
    if (Array.isArray(value)) {
      value = value.join('');
    }

    state.setTextVar(data.name, value);
  }
}

export const textDirectiveHandler = new TextDirectiveHandler(); 