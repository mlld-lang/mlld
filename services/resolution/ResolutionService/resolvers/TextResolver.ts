import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { MeldNode, TextNode, DirectiveNode } from '@core/syntax/types.js';
import { MeldResolutionError } from '@core/errors/index.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { VariableResolutionError } from '@core/errors/VariableResolutionError.js';
import { VariableType } from '@core/types';

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
          code: 'E_RESOLVE_TYPE_NOT_ALLOWED',
          severity: ErrorSeverity.Fatal,
          details: {
            variableType: VariableType.TEXT,
            directiveValue: directiveNode.directive.value,
            context: JSON.stringify(context)
          }
        }
      );
    }

    // Get the variable name and format if present
    const { identifier, format } = this.parseDirective(directiveNode);

    // Get variable value
    const valueResult = await this.stateService.getTextVar(identifier);

    if (!valueResult?.success) {
      const isEnvVar = identifier.startsWith('ENV_');
      const message = isEnvVar
        ? `Environment variable not set: ${identifier}`
        : `Undefined text variable: ${identifier}`;
      
      throw new VariableResolutionError(message, {
        code: 'E_VAR_NOT_FOUND',
        severity: ErrorSeverity.Recoverable,
        details: { 
          variableName: identifier,
          variableType: VariableType.TEXT,
          context: isEnvVar ? 'environment variable' : undefined
        },
        cause: valueResult?.error
      });
    }

    const value = valueResult.value.value;

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
          code: 'E_RESOLVE_INVALID_NODE',
          severity: ErrorSeverity.Fatal,
          details: {
            nodeType: node.type,
            expectedKind: 'text',
            actualKind: node.directive.kind,
            nodeValue: JSON.stringify(node)
          }
        }
      );
    }

    const identifier = node.directive.identifier;
    if (!identifier) {
      throw new MeldResolutionError(
        'Text variable identifier is required',
        {
          code: 'E_SYNTAX_MISSING_IDENTIFIER',
          severity: ErrorSeverity.Fatal,
          details: {
            directive: JSON.stringify(node)
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