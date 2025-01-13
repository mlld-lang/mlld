import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import * as os from 'os';
import * as path from 'path';
import { throwWithContext } from '../utils/location-helpers';

export class PathDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'path';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === PathDirectiveHandler.directiveKind;
  }

  handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): void {
    const data = node.directive;

    // Validate name parameter
    if (!data.name || typeof data.name !== 'string') {
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
    value = value.replace(/\$PROJECTPATH/g, process.cwd());

    // Handle variable substitution
    value = value.replace(/\{([^}]+)\}/g, (match, varName) => {
      const varValue = state.getPathVar(varName);
      if (!varValue) {
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

    try {
      // Resolve relative paths
      if (!path.isAbsolute(value)) {
        const basePath = context.currentPath || process.cwd();
        value = path.resolve(path.dirname(basePath), value);
      }

      // Normalize path (resolve . and ..)
      value = path.normalize(value);

      // Store in state
      state.setPathVar(data.name, value);
    } catch (error) {
      throwWithContext(
        ErrorFactory.createDirectiveError,
        `Invalid path: ${error instanceof Error ? error.message : String(error)}`,
        node.location,
        context,
        'path'
      );
    }
  }
}

export const pathDirectiveHandler = new PathDirectiveHandler(); 