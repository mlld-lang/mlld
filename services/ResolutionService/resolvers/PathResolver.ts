import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext, ResolutionErrorCode } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';

/**
 * Handles resolution of path variables ($path)
 */
export class PathResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve path variables in a string
   */
  async resolve(path: string, context: ResolutionContext): Promise<string> {
    // Early return if no path variables
    if (!path.includes('$')) {
      return this.validatePath(path, context);
    }

    // Validate path variables are allowed
    if (!context.allowedVariableTypes.path) {
      throw new ResolutionError(
        'Path variables are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: path, context }
      );
    }

    // Special handling for $HOMEPATH/$~ and $PROJECTPATH/$.
    path = path.replace(/\$~(?=\/|$)/g, '$HOMEPATH');
    path = path.replace(/\$\.(?=\/|$)/g, '$PROJECTPATH');

    // Extract and validate path variables
    const varPattern = /\$([A-Za-z_][A-Za-z0-9_]*)/g;
    const matches = path.match(varPattern);

    if (!matches) {
      return this.validatePath(path, context);
    }

    let result = path;
    for (const match of matches) {
      const varName = match.slice(1); // Remove $
      const value = this.stateService.getPathVar(varName);

      if (value === undefined) {
        throw new ResolutionError(
          `Undefined path variable: ${varName}`,
          ResolutionErrorCode.UNDEFINED_VARIABLE,
          { value: varName, context }
        );
      }

      // Replace all occurrences
      result = result.split(match).join(value);
    }

    return this.validatePath(result, context);
  }

  /**
   * Extract path variable references from a string
   */
  extractReferences(text: string): string[] {
    const refs: string[] = [];
    
    // Handle special aliases first
    const aliasPattern = /\$(~|\.)(?=\/|$)/g;
    let match;
    while ((match = aliasPattern.exec(text)) !== null) {
      refs.push(match[1]);
    }

    // Handle regular path variables
    const varPattern = /\$([A-Za-z_][A-Za-z0-9_]*)/g;
    while ((match = varPattern.exec(text)) !== null) {
      refs.push(match[1]);
    }

    return refs;
  }

  /**
   * Validate a resolved path against context requirements
   */
  private validatePath(path: string, context: ResolutionContext): string {
    if (context.pathValidation) {
      if (context.pathValidation.requireAbsolute && !path.startsWith('/')) {
        throw new ResolutionError(
          'Path must be absolute',
          ResolutionErrorCode.INVALID_PATH,
          { value: path, context }
        );
      }

      if (context.pathValidation.allowedRoots?.length) {
        const hasAllowedRoot = context.pathValidation.allowedRoots.some(root => {
          const resolvedRoot = this.stateService.getPathVar(root);
          return resolvedRoot && (
            path.startsWith(resolvedRoot + '/') || 
            path === resolvedRoot
          );
        });

        if (!hasAllowedRoot) {
          throw new ResolutionError(
            `Path must start with one of: ${context.pathValidation.allowedRoots.join(', ')}`,
            ResolutionErrorCode.INVALID_PATH,
            { value: path, context }
          );
        }
      }
    }

    return path;
  }
} 