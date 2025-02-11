import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { directiveLogger } from '../../utils/logger';
import { pathService } from '../../services/path-service';
import { MeldPathError } from '../errors/errors';

export class PathDirectiveHandler implements DirectiveHandler {
  public static readonly directiveKind = 'path';

  canHandle(kind: string, mode: 'toplevel' | 'rightside'): boolean {
    return kind === PathDirectiveHandler.directiveKind;
  }

  async handle(node: DirectiveNode, state: InterpreterState, context: HandlerContext): Promise<void> {
    const data = node.directive;
    const pathValue = data.value || data.path;
    
    directiveLogger.debug('Processing path directive', {
      name: data.name,
      value: pathValue,
      mode: context.mode,
      location: node.location
    });

    try {
      // Validate name parameter
      if (!data.name || typeof data.name !== 'string') {
        const error = await ErrorFactory.createPathError(
          'Path name is required',
          context.mode === 'rightside' && context.baseLocation?.start
            ? { line: context.baseLocation.start.line + (node.location?.start.line || 0), column: node.location?.start.column || 0 }
            : node.location?.start
        );
        directiveLogger.error('Path directive failed', {
          name: data.name,
          value: pathValue,
          error: error.message,
          mode: context.mode
        });
        throw error;
      }

      // Validate value parameter
      if (!pathValue || typeof pathValue !== 'string') {
        const error = await ErrorFactory.createPathError(
          'Path value is required',
          context.mode === 'rightside' && context.baseLocation?.start
            ? { line: context.baseLocation.start.line + (node.location?.start.line || 0), column: node.location?.start.column || 0 }
            : node.location?.start
        );
        directiveLogger.error('Path directive failed', {
          name: data.name,
          value: pathValue,
          error: error.message,
          mode: context.mode
        });
        throw error;
      }

      // Set current path for relative path resolution
      const currentPath = state.getCurrentFilePath() || context.workspaceRoot || process.cwd();
      pathService.setCurrentPath(currentPath);

      // Copy over any path variables from the interpreter state
      for (const [name, value] of state.getAllPathVars()) {
        pathService.setPathVariable(name, value);
      }

      // Resolve the path
      let resolvedPath: string;
      try {
        resolvedPath = await pathService.resolvePath(pathValue);
      } catch (error) {
        const wrappedError = await ErrorFactory.createPathError(
          error instanceof Error ? error.message : String(error),
          context.mode === 'rightside' && context.baseLocation?.start
            ? { line: context.baseLocation.start.line + (node.location?.start.line || 0), column: node.location?.start.column || 0 }
            : node.location?.start
        );
        directiveLogger.error('Path directive failed', {
          name: data.name,
          value: pathValue,
          error: wrappedError.message,
          mode: context.mode
        });
        throw wrappedError;
      }

      // Store the resolved path
      state.setPathVar(data.name, resolvedPath);

      directiveLogger.info('Path directive processed', {
        name: data.name,
        value: pathValue,
        resolved: resolvedPath,
        mode: context.mode
      });
    } catch (error) {
      // If it's already a MeldPathError, adjust its location for right-side mode
      if (error instanceof MeldPathError) {
        if (context.mode === 'rightside' && context.baseLocation?.start && node.location?.start) {
          error.location = {
            line: context.baseLocation.start.line + node.location.start.line,
            column: node.location.start.column
          };
        }
        throw error;
      }

      // Otherwise wrap it with location information
      const wrappedError = await ErrorFactory.createPathError(
        error instanceof Error ? error.message : String(error),
        context.mode === 'rightside' && context.baseLocation?.start
          ? { line: context.baseLocation.start.line + (node.location?.start.line || 0), column: node.location?.start.column || 0 }
          : node.location?.start
      );
      directiveLogger.error('Path directive failed', {
        name: data.name,
        value: pathValue,
        error: wrappedError.message,
        mode: context.mode
      });
      throw wrappedError;
    }
  }
}

// Export a singleton instance
export const pathDirectiveHandler = new PathDirectiveHandler(); 