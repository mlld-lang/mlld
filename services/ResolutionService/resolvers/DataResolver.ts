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
    // Early return if not a directive node
    if (node.type !== 'Directive') {
      return node.type === 'Text' ? (node as TextNode).content : '';
    }

    const directiveNode = node as DirectiveNode;

    // Validate data variables are allowed
    if (!context.allowedVariableTypes.data) {
      throw new ResolutionError(
        'Data variables are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: directiveNode.directive.value, context }
      );
    }

    // Get the variable identifier and field path
    const { identifier, field } = this.parseDirective(directiveNode);

    // Get variable value
    const value = directiveNode.directive.value ?? this.stateService.getDataVar(identifier);

    if (value === undefined) {
      throw new ResolutionError(
        `Undefined data variable: ${identifier}`,
        ResolutionErrorCode.UNDEFINED_VARIABLE,
        { value: identifier, context }
      );
    }

    // Handle field access if present
    if (field || directiveNode.directive.fields) {
      // Check if field access is allowed
      if (context.allowDataFields === false) {
        throw new ResolutionError(
          'Field access is not allowed in this context',
          ResolutionErrorCode.INVALID_CONTEXT,
          { value: field || directiveNode.directive.fields, context }
        );
      }
      return this.resolveField(value, field || directiveNode.directive.fields!, identifier);
    }

    // Convert value to string
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
   * Parse a directive node to extract identifier and optional field
   */
  private parseDirective(node: DirectiveNode): { identifier: string; field?: string } {
    if (node.directive.kind !== 'data') {
      throw new ResolutionError(
        'Invalid node type for data resolution',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(node) }
      );
    }

    const identifier = node.directive.identifier;
    if (!identifier) {
      throw new ResolutionError(
        'Data variable identifier is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: JSON.stringify(node) }
      );
    }

    // Check for field access in identifier
    const parts = identifier.split('.');
    if (parts.length > 1) {
      return {
        identifier: parts[0],
        field: parts.slice(1).join('.')
      };
    }

    return { identifier };
  }

  /**
   * Resolve a field path in a data value
   */
  private resolveField(value: any, field: string, identifier: string): string {
    // Split field path into parts
    const parts = field.split('.');
    let current = value;

    // Traverse the object using the field path
    for (const part of parts) {
      if (current === null || current === undefined) {
        throw new ResolutionError(
          `Cannot access field '${part}' of undefined or null`,
          ResolutionErrorCode.FIELD_ACCESS_ERROR,
          { value: identifier }
        );
      }

      if (typeof current !== 'object') {
        throw new ResolutionError(
          `Cannot access field '${part}' of non-object value`,
          ResolutionErrorCode.FIELD_ACCESS_ERROR,
          { value: identifier }
        );
      }

      if (!(part in current)) {
        throw new ResolutionError(
          `Field not found: ${part} in ${identifier}.${field}`,
          ResolutionErrorCode.FIELD_ACCESS_ERROR,
          { value: identifier }
        );
      }

      current = current[part];
    }

    // Return the actual value for field access
    return String(current);
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