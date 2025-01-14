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
      path: data.path,
      mode: context.mode,
      location: node.location
    });

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

    // Resolve path relative to workspace root
    const workspaceRoot = context.workspaceRoot || process.cwd();
    const resolvedPath = resolve(workspaceRoot, data.path);

    // Store path in state
    state.setCurrentFilePath(resolvedPath);

    directiveLogger.info('Path set successfully', {
      path: resolvedPath,
      mode: context.mode
    });
  }
}

// Export a singleton instance
export const pathDirectiveHandler = new PathDirectiveHandler(); 