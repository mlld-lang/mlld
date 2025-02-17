import { MeldNode, DirectiveNode, TextNode } from 'meld-spec';
import { IStateService } from '@services/StateService/IStateService.js';
import { ResolutionContext, ResolutionErrorCode } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/ResolutionService/errors/ResolutionError.js';

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
      throw new ResolutionError(
        'Invalid node type for data resolution',
        ResolutionErrorCode.INVALID_NODE_TYPE,
        { value: node.type }
      );
    }

    const directiveNode = node as DirectiveNode;

    if (!context.allowedVariableTypes.data) {
      throw new ResolutionError(
        'Data variables are not allowed in this context',
        ResolutionErrorCode.INVALID_VARIABLE_TYPE,
        { value: directiveNode.directive.value, context }
      );
    }

    const identifier = directiveNode.directive.identifier;
    if (!identifier) {
      throw new ResolutionError(
        'Data variable identifier is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(directiveNode) }
      );
    }

    const value = this.stateService.getDataVar(identifier);
    if (value === undefined) {
      throw new ResolutionError(
        `Undefined data variable: ${identifier}`,
        ResolutionErrorCode.UNDEFINED_VARIABLE,
        { value: identifier, context }
      );
    }

    // Handle field access if needed
    if (directiveNode.directive.fields) {
      if (!context.allowDataFields) {
        throw new ResolutionError(
          'Field access is not allowed in this context',
          ResolutionErrorCode.FIELD_ACCESS_ERROR,
          { value: directiveNode.directive.fields, context }
        );
      }

      const fields = directiveNode.directive.fields.split('.');
      let current = value;

      for (const field of fields) {
        if (current === undefined || current === null) {
          throw new ResolutionError(
            `Cannot access field '${field}' of undefined or null`,
            ResolutionErrorCode.FIELD_ACCESS_ERROR,
            { value: directiveNode.directive.fields, context }
          );
        }

        if (typeof current !== 'object') {
          throw new ResolutionError(
            `Cannot access field '${field}' of non-object value`,
            ResolutionErrorCode.FIELD_ACCESS_ERROR,
            { value: directiveNode.directive.fields, context }
          );
        }

        if (!(field in current)) {
          throw new ResolutionError(
            `Field not found: ${field} in ${identifier}.${directiveNode.directive.fields}`,
            ResolutionErrorCode.FIELD_ACCESS_ERROR,
            { value: directiveNode.directive.fields, context }
          );
        }

        current = current[field];
      }

      return this.stringifyValue(current);
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
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }
} 