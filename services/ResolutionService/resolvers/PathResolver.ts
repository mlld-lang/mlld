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
    if (!context.allowPathVars) {
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

    // Validate path starts with $HOMEPATH or $PROJECTPATH
    if (!result.startsWith('/')) {
      throw new ResolutionError(
        'Path must be absolute (start with $HOMEPATH/$~ or $PROJECTPATH/$.)',
        ResolutionErrorCode.INVALID_PATH,
        { value: path, context }
      );
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
      const varName = match[1];
      // Convert aliases to their full names
      if (varName === '~') {
        refs.push('HOMEPATH');
      } else if (varName === '.') {
        refs.push('PROJECTPATH');
      } else {
        refs.push(varName);
      }
    }

    return refs;
  }
} 