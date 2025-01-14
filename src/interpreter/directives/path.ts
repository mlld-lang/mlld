import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';
import * as path from 'path';
import * as os from 'os';

export class PathDirectiveHandler implements DirectiveHandler {
  readonly directiveKind = 'path';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === 'path';
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;

    // Validate name parameter
    if (!data.name) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Path directive requires a name parameter',
        node.location,
        context,
        'path'
      );
    }

    // Validate value parameter
    if (data.value === undefined || data.value === null) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        'Path directive requires a value parameter',
        node.location,
        context,
        'path'
      );
    }

    // Get the value and handle special variables
    let value = String(data.value);

    // Handle special path variables
    value = value.replace(/\$HOMEPATH|\$~/g, os.homedir());
    value = value.replace(/\$PROJECTPATH/g, context.workspaceRoot || process.cwd());

    // Handle variable substitution
    value = value.replace(/\{([^}]+)\}/g, (match, varName) => {
      const varValue = state.getPathVar(varName);
      if (varValue === undefined) {
        throwWithContext(
          ErrorFactory.createDirectiveError,
          `Path variable '${varName}' not found`,
          node.location,
          context,
          'path'
        );
      }
      return varValue;
    });

    // Resolve the path
    const workspaceRoot = context.workspaceRoot || process.cwd();
    if (path.isAbsolute(value)) {
      // For absolute paths, use as is without prepending workspace root
      state.setPathVar(data.name, path.normalize(value));
    } else {
      // For relative paths, resolve relative to workspace root
      state.setPathVar(data.name, path.normalize(path.resolve(workspaceRoot, value)));
    }
  }
}

// Export a singleton instance
export const pathDirectiveHandler = new PathDirectiveHandler(); 