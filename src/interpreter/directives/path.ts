import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';
import { pathService } from '../../services/path-service';

export class PathDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'path';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === PathDirectiveHandler.directiveKind;
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    directiveLogger.debug('Processing path directive', {
      name: data.name,
      value: data.value,
      mode: context.mode,
      location: node.location
    });

    // Validate name parameter
    if (!data.name || typeof data.name !== 'string') {
      directiveLogger.error('Path name is required', {
        location: node.location,
        mode: context.mode
      });
      await throwWithContext(
        ErrorFactory.createPathError,
        'Path name is required',
        node.location,
        context
      );
    }

    // Validate value parameter
    if (!data.value || typeof data.value !== 'string') {
      directiveLogger.error('Path value is required', {
        location: node.location,
        mode: context.mode
      });
      await throwWithContext(
        ErrorFactory.createPathError,
        'Path value is required',
        node.location,
        context
      );
    }

    try {
      // Set current path for relative path resolution
      const currentPath = state.getCurrentFilePath() || context.workspaceRoot || process.cwd();
      pathService.setCurrentPath(currentPath);

      // Resolve the path
      const resolvedPath = await pathService.resolvePath(data.value);

      // Store the resolved path
      state.setPathVar(data.name, resolvedPath);

      directiveLogger.info('Path directive processed', {
        name: data.name,
        value: data.value,
        resolved: resolvedPath
      });
    } catch (error) {
      directiveLogger.error('Path directive failed', {
        name: data.name,
        value: data.value,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

// Export a singleton instance
export const pathDirectiveHandler = new PathDirectiveHandler(); 