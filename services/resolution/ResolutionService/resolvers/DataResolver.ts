import type { MeldNode, DirectiveNode, TextNode } from '@core/ast/ast/astTypes.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext } from '@core/types/resolution.js';
import { VariableType, JsonObject } from '@core/types/index.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { VariableResolutionError } from '@core/errors/VariableResolutionError.js';
import { FieldAccessError } from '@core/errors/FieldAccessError.js';

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
          code: 'E_RESOLVE_INVALID_NODE',
          severity: ErrorSeverity.Fatal,
          details: {
            nodeType: node.type,
            expectedKind: 'data',
            actualKind: node.type === 'Directive' ? (node as DirectiveNode).directive.kind : undefined,
            context
          }
        }
      );
    }

    const directiveNode = node as DirectiveNode;

    if (!context.allowedVariableTypes.data) {
      throw new MeldResolutionError(
        'Data variables are not allowed in this context',
        {
          code: 'E_RESOLVE_TYPE_NOT_ALLOWED',
          severity: ErrorSeverity.Fatal,
          details: {
            variableType: VariableType.DATA,
            directiveValue: directiveNode.directive.value,
            context
          }
        }
      );
    }

    const identifier = directiveNode.directive.identifier;
    if (!identifier) {
      throw new MeldResolutionError(
        'Data variable identifier is required',
        {
          code: 'E_SYNTAX_MISSING_IDENTIFIER',
          severity: ErrorSeverity.Fatal,
          details: {
            directive: JSON.stringify(directiveNode)
          }
        }
      );
    }

    const valueResult = await this.stateService.getDataVar(identifier);
    if (!valueResult || !valueResult.success) {
      throw new VariableResolutionError(
        `Data variable '${identifier}' not found`,
        {
          code: 'E_VAR_NOT_FOUND',
          severity: ErrorSeverity.Recoverable,
          details: {
            variableName: identifier,
            variableType: VariableType.DATA
          },
          cause: valueResult?.error
        }
      );
    }
    const value = valueResult.value.value;

    // Handle field access
    if (directiveNode.directive.field) {
      const field = directiveNode.directive.field;
      
      let fieldValue: any;
      if (typeof value === 'object' && value !== null && field in value) {
         fieldValue = (value as JsonObject)[field];
      } else {
         fieldValue = undefined;
      }

      if (fieldValue === undefined) {
        throw new FieldAccessError(
          `Field '${field}' not found in data variable '${identifier}'`,
          {
            details: {
              variableName: identifier,
              fieldAccessChain: [{ type: 'dot', field: field }],
              failedAtIndex: 0,
              targetValue: value
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