import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { MeldDirectiveError } from '../errors/errors';
import { adjustLocation } from '../utils/location';

export class PathDirectiveHandler implements DirectiveHandler {
  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === '@path';
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;
    const errorLocation = context.mode === 'rightside'
      ? adjustLocation(node.location, context.baseLocation)?.start
      : node.location?.start;

    if (!data.name) {
      throw new MeldDirectiveError('Path directive requires a name', 'path', errorLocation);
    }
    if (!data.value) {
      throw new MeldDirectiveError('Path directive requires a value', 'path', errorLocation);
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
        errorLocation
      );
    }

    // Replace variables
    value = value.replace(/\$HOMEPATH|\$~/g, '/Users/test');
    value = value.replace(/\$PROJECTPATH|\$\./g, '/project/root');

    state.setPathVar(data.name, value);
  }
}

export const pathDirectiveHandler = new PathDirectiveHandler(); 