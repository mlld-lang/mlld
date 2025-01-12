import type { DirectiveNode, DirectiveKind } from 'meld-spec';
import { DirectiveHandler } from './index.js';
import { InterpreterState } from '../state/state.js';
import { MeldDirectiveError } from '../errors/errors.js';

interface PathDirectiveData {
  kind: 'path';
  identifier: string;
  value: string | string[];
}

/**
 * Handler for @path directives
 */
export class PathDirectiveHandler implements DirectiveHandler {
  canHandle(kind: DirectiveKind): boolean {
    return kind === 'path';
  }

  handle(node: DirectiveNode, state: InterpreterState): void {
    const data = node.directive as PathDirectiveData;
    
    if (!data.identifier) {
      throw new MeldDirectiveError(
        'Path directive requires an identifier',
        'path',
        node.location?.start
      );
    }

    if (data.value === undefined) {
      throw new MeldDirectiveError(
        'Path directive requires a value',
        'path',
        node.location?.start
      );
    }

    // Handle string concatenation with array values
    const value = Array.isArray(data.value) ? data.value.join('') : data.value;

    // Validate path starts with special variable
    if (!value.startsWith('$HOMEPATH/') && !value.startsWith('$~/') && 
        !value.startsWith('$PROJECTPATH/') && !value.startsWith('$./')) {
      throw new MeldDirectiveError(
        'Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.',
        'path',
        node.location?.start
      );
    }

    // Resolve path variables
    let resolvedPath = value;
    if (value.startsWith('$HOMEPATH/') || value.startsWith('$~/')) {
      const homePath = process.env.HOME || process.env.USERPROFILE || '/';
      resolvedPath = value.replace(/^\$(?:HOMEPATH|~)\//, `${homePath}/`);
    } else if (value.startsWith('$PROJECTPATH/') || value.startsWith('$./')) {
      const projectPath = process.cwd(); // TODO: Make this configurable
      resolvedPath = value.replace(/^\$(?:PROJECTPATH|\.)\//, `${projectPath}/`);
    }

    state.setPathVar(data.identifier, resolvedPath);
  }
} 