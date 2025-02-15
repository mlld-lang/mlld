import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext, ResolutionErrorCode } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';
import { MeldNode } from 'meld-spec';

/**
 * Handles resolution of text variables (${var})
 */
export class TextResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve text variables in a node
   */
  async resolve(node: MeldNode, context: ResolutionContext): Promise<string> {
    // Early return if not a directive node
    if (node.type !== 'Directive') {
      return node.type === 'Text' ? node.content : '';
    }

    // Validate text variables are allowed
    if (!context.allowedVariableTypes.text) {
      throw new ResolutionError(
        'Text variables are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: node.directive.value, context }
      );
    }

    // Get the variable name and format if present
    const { name, format } = this.parseDirective(node);

    // Get variable value
    const value = this.stateService.getTextVar(name);

    if (value === undefined) {
      // Special handling for ENV variables
      if (name.startsWith('ENV_')) {
        throw new ResolutionError(
          `Environment variable not set: ${name}`,
          ResolutionErrorCode.UNDEFINED_VARIABLE,
          { value: name, context }
        );
      }
      throw new ResolutionError(
        `Undefined text variable: ${name}`,
        ResolutionErrorCode.UNDEFINED_VARIABLE,
        { value: name, context }
      );
    }

    // Apply format if present
    return format ? this.applyFormat(value, format) : value;
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive' || node.directive.kind !== 'text') {
      return [];
    }

    return [node.directive.name];
  }

  /**
   * Parse a directive node to extract name and format
   */
  private parseDirective(node: MeldNode): { name: string; format?: string } {
    if (!node.directive || node.directive.kind !== 'text') {
      throw new ResolutionError(
        'Invalid node type for text resolution',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: node }
      );
    }

    const name = node.directive.name;
    if (!name) {
      throw new ResolutionError(
        'Text variable name is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: node }
      );
    }

    return {
      name,
      format: node.directive.format
    };
  }

  /**
   * Apply format to a value
   */
  private applyFormat(value: string, format: string): string {
    // TODO: Implement format handling
    // For now just return the value as formats aren't specified in UX.md
    return value;
  }
} 