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
    // Early return if no variables
    if (!text.includes('${')) {
      return text;
    }

    // Validate text variables are allowed
    if (!context.allowedVariableTypes.text) {
      throw new ResolutionError(
        'Text variables are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: text, context }
      );
    }

    // Check for nested variables
    if (this.hasNestedVariables(text)) {
      throw new ResolutionError(
        'Nested variable interpolation is not allowed',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: text, context }
      );
    }

    // Extract and validate text variables
    const varPattern = /\${([A-Za-z_][A-Za-z0-9_]*)(?:>>.*?)?}/g;
    const matches = text.match(varPattern);

    if (!matches) {
      return text;
    }

    let result = text;
    for (const match of matches) {
      // Extract variable name and format if present
      const [fullMatch, varName, format] = match.match(/\${([A-Za-z_][A-Za-z0-9_]*)(?:>>(.+?))?}/) || [];
      
      // Get variable value
      const value = this.stateService.getTextVar(varName);

      if (value === undefined) {
        // Special handling for ENV variables
        if (varName.startsWith('ENV_')) {
          throw new ResolutionError(
            `Environment variable not set: ${varName}`,
            ResolutionErrorCode.UNDEFINED_VARIABLE,
            { value: varName, context }
          );
        }
        throw new ResolutionError(
          `Undefined text variable: ${varName}`,
          ResolutionErrorCode.UNDEFINED_VARIABLE,
          { value: varName, context }
        );
      }

      // Apply format if present
      let resolvedValue = value;
      if (format) {
        resolvedValue = this.applyFormat(value, format);
      }

      // Replace all occurrences
      result = result.split(fullMatch).join(resolvedValue);
    }

    return result;
  }

  /**
   * Extract text variable references from a string
   */
  extractReferences(text: string): string[] {
    const refs: string[] = [];
    const varPattern = /\${([A-Za-z_][A-Za-z0-9_]*)(?:>>.*?)?}/g;
    let match;
    
    while ((match = varPattern.exec(text)) !== null) {
      refs.push(match[1]);
    }

    return refs;
  }

  /**
   * Apply format to a value
   */
  private applyFormat(value: string, format: string): string {
    // TODO: Implement format handling
    // For now just return the value as formats aren't specified in UX.md
    return value;
  }

  /**
   * Check if text contains nested variables
   */
  private hasNestedVariables(text: string): boolean {
    let depth = 0;
    for (let i = 0; i < text.length - 1; i++) {
      if (text[i] === '$' && text[i + 1] === '{') {
        depth++;
        if (depth > 1) return true;
      } else if (text[i] === '}') {
        depth--;
      }
    }
    return false;
  }
} 