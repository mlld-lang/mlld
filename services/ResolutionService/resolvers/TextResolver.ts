import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext, ResolutionErrorCode } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';

/**
 * Handles resolution of text variables (${var})
 */
export class TextResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve text variables in a string
   */
  async resolve(text: string, context: ResolutionContext): Promise<string> {
    // Early return if no variables to resolve
    if (!text.includes('${')) {
      return text;
    }

    let result = text;
    const varPattern = /\${([^}]+)}/g;
    const matches = text.match(varPattern);

    if (!matches) {
      return text;
    }

    // Check for nested variables if not allowed
    if (!context.allowNested) {
      for (const match of matches) {
        if (match.includes('${', 2)) { // 2 to skip the first ${
          throw new ResolutionError(
            'Nested variable interpolation is not allowed in this context',
            ResolutionErrorCode.INVALID_CONTEXT,
            { value: text, context }
          );
        }
      }
    }

    // Process each variable
    for (const match of matches) {
      const varName = match.slice(2, -1); // Remove ${ and }
      const value = this.stateService.getTextVar(varName);

      if (value === undefined) {
        throw new ResolutionError(
          `Undefined text variable: ${varName}`,
          ResolutionErrorCode.UNDEFINED_VARIABLE,
          { value: varName, context }
        );
      }

      // Replace all occurrences
      result = result.split(match).join(value);
    }

    return result;
  }

  /**
   * Extract text variable references from a string
   */
  extractReferences(text: string): string[] {
    const refs: string[] = [];
    const varPattern = /\${([^}]+)}/g;
    let match;

    while ((match = varPattern.exec(text)) !== null) {
      refs.push(match[1]); // Add the variable name
    }

    return refs;
  }
} 