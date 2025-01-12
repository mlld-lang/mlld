import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './index.js';
import { InterpreterState } from '../state/state.js';
import { MeldDirectiveError } from '../errors/errors.js';

interface DataDirectiveData {
  kind: 'data';
  identifier: string;
  value: any;
}

/**
 * Handler for @data directives
 */
class DataDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === 'data';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive;
    
    if (!data.name) {
      throw new MeldDirectiveError(
        'Data directive requires a name',
        'data',
        node.location?.start
      );
    }

    if (!data.value) {
      throw new MeldDirectiveError(
        'Data directive requires a value',
        'data',
        node.location?.start
      );
    }

    state.setDataVar(data.name, data.value);
  }
}

export const dataDirectiveHandler = new DataDirectiveHandler(); 