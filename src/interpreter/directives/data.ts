import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './index.js';
import { InterpreterState } from '../state/state.js';

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
      throw new Error('Data directive requires an identifier');
    }

    if (data.value === undefined) {
      throw new Error('Data directive requires a value');
    }

    // Store the value in state
    state.setDataVar(data.identifier, data.value);
  }
} 