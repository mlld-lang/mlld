import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext, ResolutionErrorCode } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';
import { MeldNode } from 'meld-spec';

/**
 * Handles resolution of data variables (#{data.field})
 */
export class DataResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve data variables in a node
   */
  async resolve(node: MeldNode, context: ResolutionContext): Promise<string> {
    // Early return if not a directive node
    if (node.type !== 'Directive') {
      return node.type === 'Text' ? node.content : '';
    }

    // Validate data variables are allowed
    if (!context.allowedVariableTypes.data) {
      throw new ResolutionError(
        'Data variables are not allowed in this context',
        ResolutionErrorCode.INVALID_CONTEXT,
        { value: node.directive.value, context }
      );
    }

    // Get the variable name and field path if present
    const { name, fields } = this.parseDirective(node);

    // Get variable value
    const value = this.stateService.getDataVar(name);

    if (value === undefined) {
      throw new ResolutionError(
        `Undefined data variable: ${name}`,
        ResolutionErrorCode.UNDEFINED_VARIABLE,
        { value: name, context }
      );
    }

    // If no fields to access, convert value to string
    if (!fields || fields.length === 0) {
      return this.convertToString(value);
    }

    // Validate field access is allowed
    if (!context.allowDataFields) {
      throw new ResolutionError(
        'Field access is not allowed in this context',
        ResolutionErrorCode.FIELD_ACCESS_ERROR,
        { value: node.directive.value, context }
      );
    }

    // Access fields
    let current = value;
    for (const field of fields) {
      if (current === null || current === undefined) {
        throw new ResolutionError(
          `Cannot access field '${field}' of undefined or null`,
          ResolutionErrorCode.FIELD_ACCESS_ERROR,
          { value: node.directive.value, context }
        );
      }

      if (typeof current !== 'object') {
        throw new ResolutionError(
          `Cannot access field '${field}' of non-object value`,
          ResolutionErrorCode.FIELD_ACCESS_ERROR,
          { value: node.directive.value, context }
        );
      }

      if (!(field in current)) {
        throw new ResolutionError(
          `Field not found: ${field} in ${name}.${fields.join('.')}`,
          ResolutionErrorCode.FIELD_ACCESS_ERROR,
          { value: node.directive.value, context }
        );
      }

      current = current[field];
    }

    return this.convertToString(current);
  }

  /**
   * Extract references from a node
   */
  extractReferences(node: MeldNode): string[] {
    if (node.type !== 'Directive' || node.directive.kind !== 'data') {
      return [];
    }

    return [node.directive.name];
  }

  /**
   * Parse a directive node to extract name and fields
   */
  private parseDirective(node: MeldNode): { name: string; fields?: string[] } {
    if (!node.directive || node.directive.kind !== 'data') {
      throw new ResolutionError(
        'Invalid node type for data resolution',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: node }
      );
    }

    const name = node.directive.name;
    if (!name) {
      throw new ResolutionError(
        'Data variable name is required',
        ResolutionErrorCode.SYNTAX_ERROR,
        { value: node }
      );
    }

    // Parse field path if present
    const fields = node.directive.fields?.split('.') ?? [];

    return { name, fields };
  }

  /**
   * Convert a value to string representation
   */
  private convertToString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }
} 