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

    const value = await this.stateService.getDataVar(identifier);
    if (value === undefined) {
      console.warn(`Warning: Data variable '${identifier}' not found`);
      return '';
    }

    // Handle field access
    if (directiveNode.directive.field) {
      const field = directiveNode.directive.field;
      const fieldValue = value[field];
      if (fieldValue === undefined) {
        console.warn(`Warning: Field '${field}' not found in data variable '${identifier}'`);
        return '';
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