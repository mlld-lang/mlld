import { DirectiveNode } from 'meld-spec';
import { DirectiveHandler, HandlerContext } from './types';
import { InterpreterState } from '../state/state';
import { ErrorFactory } from '../errors/factory';
import { throwWithContext } from '../utils/location-helpers';
import { directiveLogger } from '../../utils/logger';
import { pathService } from '../../services/path-service';
import path from 'path';

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
    if (!pathValue || typeof pathValue !== 'string') {
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

    // Handle path variable substitution
    let resolvedPathValue = pathValue;
    const varRegex = /\${([^}]+)}/g;
    let match;
    while ((match = varRegex.exec(resolvedPathValue)) !== null) {
      const varName = match[1];
      const varValue = state.getPathVar(varName);
      if (!varValue) {
        directiveLogger.error('Path variable not found', {
          location: node.location,
          mode: context.mode,
          variable: varName
        });
        await throwWithContext(
          ErrorFactory.createPathError,
          `Path variable '${varName}' not found`,
          node.location,
          context
        );
      }
      resolvedPathValue = resolvedPathValue.replace(match[0], varValue);
    }

    // If the resolved path doesn't start with a special variable, wrap it with the appropriate prefix
    if (!resolvedPathValue.startsWith('$HOMEPATH/') && !resolvedPathValue.startsWith('$~/') && !resolvedPathValue.startsWith('$PROJECTPATH/')) {
      // Check if this is a concatenated path from a variable
      if (resolvedPathValue.startsWith('/')) {
        // Extract the base path to determine which prefix to use
        const basePath = resolvedPathValue.split('/').slice(0, -1).join('/');
        if (basePath.includes('home')) {
          resolvedPathValue = `$HOMEPATH/${resolvedPathValue.split('/').pop()}`;
        } else if (basePath.includes('project')) {
          resolvedPathValue = `$PROJECTPATH/${resolvedPathValue.split('/').pop()}`;
        } else {
          directiveLogger.error('Invalid path format', {
            location: node.location,
            mode: context.mode,
            path: resolvedPathValue
          });
          await throwWithContext(
            ErrorFactory.createPathError,
            'Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.',
            node.location,
            context
          );
        }
      } else {
        directiveLogger.error('Invalid path format', {
          location: node.location,
          mode: context.mode,
          path: resolvedPathValue
        });
        await throwWithContext(
          ErrorFactory.createPathError,
          'Path must start with $HOMEPATH/$~ or $PROJECTPATH/$.',
          node.location,
          context
        );
      }
    }

    // Check for path traversal attempts
    const normalizedPath = path.normalize(resolvedPathValue);
    const pathParts = normalizedPath.split(/[/\\]/);
    let depth = 0;
    
    for (const part of pathParts) {
      if (part === '..') {
        depth--;
        if (depth < 0) {
          directiveLogger.error('Path traversal not allowed', {
            location: node.location,
            mode: context.mode,
            path: resolvedPathValue
          });
          await throwWithContext(
            ErrorFactory.createPathError,
            'Relative navigation (..) is not allowed in paths',
            node.location,
            context
          );
        }
      } else if (part !== '.' && part !== '') {
        depth++;
      }
    }

    resolvedPathValue = normalizedPath;

    try {
      // Set current path for relative path resolution
      const currentPath = state.getCurrentFilePath() || context.workspaceRoot || process.cwd();
      pathService.setCurrentPath(currentPath);

      // Resolve the path
      const resolvedPath = await pathService.resolvePath(resolvedPathValue);

      // Store the resolved path
      state.setPathVar(data.name, resolvedPath);

      directiveLogger.info('Path directive processed', {
        name: data.name,
        value: resolvedPathValue,
        resolved: resolvedPath
      });
    } catch (error) {
      directiveLogger.error('Path directive failed', {
        name: data.name,
        value: resolvedPathValue,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

// Export a singleton instance
export const pathDirectiveHandler = new PathDirectiveHandler(); 