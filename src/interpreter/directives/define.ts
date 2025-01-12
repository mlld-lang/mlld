import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './index.js';
import { InterpreterState } from '../state/state.js';
import { MeldDirectiveError } from '../errors/errors.js';

interface DefineDirectiveData {
  kind: 'define';
  name: string;
  body: string;
}

/**
 * Handler for @define directives
 */
class DefineDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === 'define';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive as DefineDirectiveData;
    
    if (!data.name) {
      throw new MeldDirectiveError(
        'Define directive requires a name',
        'define',
        node.location?.start
      );
    }

    if (!data.body) {
      throw new MeldDirectiveError(
        'Define directive requires a body',
        'define',
        node.location?.start
      );
    }

    // Store the definition in state
    state.setCommand(data.name, () => data.body);
  }
}

export const defineDirectiveHandler = new DefineDirectiveHandler(); 