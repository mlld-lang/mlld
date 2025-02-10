import type { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';
import { resolve, dirname } from 'path';

export class PathDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'path';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === PathDirectiveHandler.directiveKind;
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    directiveLogger.debug('Processing path directive', {
      name: data.name,
      path: data.path,
      mode: context.mode,
      location: node.location
    });

    // Validate name parameter
    if (!data.name || typeof data.name !== 'string') {
      directiveLogger.error('Path directive missing name', {
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createPathError,
        'Path directive requires a name parameter',
        node.location,
        context
      );
    }

    // Validate path parameter
    if (!data.path || typeof data.path !== 'string') {
      directiveLogger.error('Path directive missing path', {
        location: node.location,
        mode: context.mode
      });
      throwWithContext(
        ErrorFactory.createPathError,
        'Path directive requires a path parameter',
        node.location,
        context
      );
    }

    // Resolve path relative to current file or workspace root
    const basePath = state.getCurrentFilePath() || context.workspaceRoot || process.cwd();
    const resolvedPath = resolve(dirname(basePath), data.path);

    // Store path in state
    state.setPathVar(data.name, resolvedPath);

    directiveLogger.info('Path set successfully', {
      name: data.name,
      path: resolvedPath,
      mode: context.mode
    });
  }
}

// Export a singleton instance
export const pathDirectiveHandler = new PathDirectiveHandler(); 