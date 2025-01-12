import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';

interface PathDirectiveData {
  kind: '@path';
  name: string;
  value: string | string[];
}

class PathDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === '@path';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive;
    if (!data.name) {
      throw new MeldDirectiveError('Path directive requires a name', 'path', node.location?.start);
    }
    if (!data.value) {
      throw new MeldDirectiveError('Path directive requires a value', 'path', node.location?.start);
    }

    let value = data.value;
    if (Array.isArray(value)) {
      value = value.join('');
    }

    // Handle special variables
    if (!value.startsWith('$HOMEPATH') && !value.startsWith('$~') && 
        !value.startsWith('$PROJECTPATH') && !value.startsWith('$.')) {
      throw new MeldDirectiveError(
        'Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.',
        'path',
        node.location?.start
      );
    }

    // Replace variables
    value = value.replace(/\$HOMEPATH|\$~/g, '/Users/test');
    value = value.replace(/\$PROJECTPATH|\$\./g, '/project/root');

    state.setPathVar(data.name, value);
  }
}

export const pathDirectiveHandler = new PathDirectiveHandler(); 