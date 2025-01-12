import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './index.js';
import { InterpreterState } from '../state/state.js';
import { MeldDirectiveError } from '../errors/errors.js';

interface PathDirectiveData {
  kind: 'path';
  name: string;
  value: string;
}

/**
 * Handler for @path directives
 */
class PathDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === 'path';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive as PathDirectiveData;
    
    if (!data.name) {
      throw new MeldDirectiveError(
        'Path directive requires a name',
        'path',
        node.location?.start
      );
    }

    if (!data.value) {
      throw new MeldDirectiveError(
        'Path directive requires a value',
        'path',
        node.location?.start
      );
    }

    // Store the path in state
    state.setPathVar(data.name, data.value);
  }
}

export const pathDirectiveHandler = new PathDirectiveHandler(); 