import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { MeldNode, TextNode, DirectiveNode } from '@core/syntax/types.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

/**
 * Handles resolution of text variables ({{var}})
 * Previously used ${var} syntax, now unified with data variables to use {{var}}
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
      throw new MeldResolutionError(
        'Text variables are not allowed in this context',
        {
          code: ResolutionErrorCode.INVALID_CONTEXT,
          severity: ErrorSeverity.Fatal,
          details: { 
            value: directiveNode.directive.value,
            context: JSON.stringify(context)
          }
        }
      );
    }

    // Get the variable name and format if present
    const { identifier, format } = this.parseDirective(directiveNode);

    // Get variable value
    const value = this.stateService.getTextVar(identifier);

    if (value === undefined) {
      // Special handling for ENV variables
      if (identifier.startsWith('ENV_')) {
        throw new MeldResolutionError(
          `Environment variable not set: ${identifier}`,
          {
            code: ResolutionErrorCode.UNDEFINED_VARIABLE,
            severity: ErrorSeverity.Recoverable,
            details: { 
              variableName: identifier,
              variableType: 'text',
              context: 'environment variable'
            }
          }
        );
      }
      
      throw new MeldResolutionError(
        `Undefined text variable: ${identifier}`,
        {
          code: ResolutionErrorCode.UNDEFINED_VARIABLE,
          severity: ErrorSeverity.Recoverable,
          details: { 
            variableName: identifier,
            variableType: 'text'
          }
        }
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
      throw new MeldResolutionError(
        'Invalid node type for text resolution',
        {
          code: ResolutionErrorCode.SYNTAX_ERROR,
          severity: ErrorSeverity.Fatal,
          details: { 
            value: JSON.stringify(node)
          }
        }
      );
    }

    const identifier = node.directive.identifier;
    if (!identifier) {
      throw new MeldResolutionError(
        'Text variable identifier is required',
        {
          code: ResolutionErrorCode.SYNTAX_ERROR,
          severity: ErrorSeverity.Fatal,
          details: { 
            value: JSON.stringify(node)
          }
        }
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