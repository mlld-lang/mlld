import { MeldNode, DirectiveNode, TextNode } from '@core/syntax/types';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

/**
 * Handles resolution of data variables ($data)
 */
export class DataResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve data variables in a node
   */
  async resolve(node: MeldNode, context: ResolutionContext): Promise<string> {
    // Handle text nodes by returning content unchanged
    if (node.type === 'Text') {
      return (node as TextNode).content;
    }

    // Validate node type
    if (node.type !== 'Directive' || (node as DirectiveNode).directive.kind !== 'data') {
      throw new MeldResolutionError(
        'Invalid node type for data resolution',
        {
          code: ResolutionErrorCode.INVALID_NODE_TYPE,
          severity: ErrorSeverity.Fatal,
          details: { 
            value: node.type,
            context: JSON.stringify(context)
          }
        }
      );
    }

    const directiveNode = node as DirectiveNode;

    if (!context.allowedVariableTypes.data) {
      throw new MeldResolutionError(
        'Data variables are not allowed in this context',
        {
          code: ResolutionErrorCode.INVALID_VARIABLE_TYPE,
          severity: ErrorSeverity.Fatal,
          details: { 
            value: directiveNode.directive.value,
            context: JSON.stringify(context)
          }
        }
      );
    }

    const identifier = directiveNode.directive.identifier;
    if (!identifier) {
      throw new MeldResolutionError(
        'Data variable identifier is required',
        {
          code: ResolutionErrorCode.SYNTAX_ERROR,
          severity: ErrorSeverity.Fatal,
          details: { 
            value: JSON.stringify(directiveNode)
          }
        }
      );
    }

    const value = await this.stateService.getDataVar(identifier);
    if (value === undefined) {
      throw new MeldResolutionError(
        `Data variable '${identifier}' not found`,
        {
          code: ResolutionErrorCode.UNDEFINED_VARIABLE,
          severity: ErrorSeverity.Recoverable,
          details: { 
            variableName: identifier,
            variableType: 'data'
          }
        }
      );
    }

    // Handle field access
    if (directiveNode.directive.field) {
      const field = directiveNode.directive.field;
      const fieldValue = value[field];
      if (fieldValue === undefined) {
        throw new MeldResolutionError(
          `Field '${field}' not found in data variable '${identifier}'`,
          {
            code: ResolutionErrorCode.UNDEFINED_FIELD,
            severity: ErrorSeverity.Recoverable,
            details: { 
              variableName: identifier,
              variableType: 'data',
              fieldPath: field
            }
          }
        );
      }
      return this.stringifyValue(fieldValue);
    }

    return this.stringifyValue(value);
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive' || (node as DirectiveNode).directive.kind !== 'data') {
      return [];
    }

    return [(node as DirectiveNode).directive.identifier];
  }

  /**
   * Convert a value to string format
   */
  private stringifyValue(value: any): string {
    if (value === undefined) {
      return '';
    }

    if (value === null) {
      return 'null';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }
} 