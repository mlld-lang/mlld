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
      return path;
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
      return path;
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

    // Validate path meets requirements if specified
    if (context.pathValidation) {
      if (context.pathValidation.requireAbsolute && !result.startsWith('/')) {
        throw new ResolutionError(
          'Path must be absolute',
          ResolutionErrorCode.INVALID_PATH,
          { value: path, context }
        );
      }

      if (context.pathValidation.allowedRoots?.length) {
        const hasAllowedRoot = context.pathValidation.allowedRoots.some(root => {
          const resolvedRoot = this.stateService.getPathVar(root);
          return resolvedRoot && result.startsWith(resolvedRoot);
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

    return result;
  }

  /**
   * Extract path variable references from a string
   */
  extractReferences(text: string): string[] {
    const refs: string[] = [];
    const varPattern = /\$([A-Za-z_][A-Za-z0-9_]*)/g;
    let match;

    while ((match = varPattern.exec(text)) !== null) {
      refs.push(match[1]); // Add the variable name
    }

    return refs;
  }
} 