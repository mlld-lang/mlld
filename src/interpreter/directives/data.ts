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
export class DataDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === 'data';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive as DataDirectiveData;
    
    if (!data.identifier) {
      throw new MeldDirectiveError(
        'Data directive requires an identifier',
        'data',
        node.location?.start
      );
    }

    if (data.value === undefined) {
      throw new MeldDirectiveError(
        'Data directive requires a value',
        'data',
        node.location?.start
      );
    }

    // Store the value in state
    state.setDataVar(data.identifier, data.value);
  }
} 