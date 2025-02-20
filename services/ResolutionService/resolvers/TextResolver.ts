import { IStateService } from '@services/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/ResolutionService/errors/ResolutionError.js';
import { MeldNode, TextNode, DirectiveNode } from 'meld-spec';

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
      return node.type === 'Text' ? (node as TextNode).content : '';
    }

    const directiveNode = node as DirectiveNode;

    // Validate text variables are allowed
    if (!context.allowedVariableTypes.text) {
      throw new ResolutionError(
        'Text variables are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: directiveNode.directive.value, context }
      );
    }

    // Get the variable name and format if present
    const { identifier, format } = this.parseDirective(directiveNode);

    // Get variable value
    const value = this.stateService.getTextVar(identifier);

    if (value === undefined) {
      // Special handling for ENV variables
      if (identifier.startsWith('ENV_')) {
        console.warn(`Warning: Environment variable not set: ${identifier}`);
        return '';
      }
      throw new ResolutionError(
        `Undefined text variable: ${identifier}`,
        ResolutionErrorCode.UNDEFINED_VARIABLE,
        { value: identifier, context }
      );
    }

    // Apply format if present
    return format ? this.applyFormat(value, format) : value;
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive') {
      return [];
    }
    const directiveNode = node as DirectiveNode;
    if (directiveNode.directive.kind !== 'text') {
      return [];
    }

    return [directiveNode.directive.identifier];
  }

  /**
   * Parse a directive node to extract identifier and format
   */
  private parseDirective(node: DirectiveNode): { identifier: string; format?: string } {
    if (node.directive.kind !== 'text') {
      throw new ResolutionError(
        'Invalid node type for text resolution',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(node) }
      );
    }

    const identifier = node.directive.identifier;
    if (!identifier) {
      throw new ResolutionError(
        'Text variable identifier is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(node) }
      );
    }

    return {
      identifier,
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