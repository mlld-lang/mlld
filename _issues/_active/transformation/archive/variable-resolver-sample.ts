/**
 * VariableReferenceResolver Sample Implementation
 * 
 * This is a reference implementation that properly handles both TextVar and DataVar node types
 * and provides proper formatting for complex data types.
 */

import { injectable, inject } from 'tsyringe';
import { MeldNode, TextVarNode, DataVarNode } from 'meld-ast';
import { StateService } from '../../state/StateService';
import { MeldResolutionError } from '../../../errors/MeldResolutionError';
import { ResolutionContext } from '../ResolutionContext';

@injectable()
export class VariableReferenceResolver {
  constructor(
    @inject(StateService) private stateService: StateService
  ) {}

  /**
   * Resolve a set of nodes, replacing variable references when transformation is enabled
   */
  resolveNodes(nodes: MeldNode[], context: ResolutionContext): MeldNode[] {
    if (!this.stateService.isTransformationEnabled() || !nodes || nodes.length === 0) {
      return nodes;
    }

    return nodes.map(node => this.resolveNode(node, context));
  }

  /**
   * Resolves a single node, handling different node types appropriately
   */
  private resolveNode(node: MeldNode, context: ResolutionContext): MeldNode {
    // Handle different node types
    if (node.type === 'TextVar') {
      const resolved = this.resolveTextVar(node as TextVarNode, context);
      return {
        type: 'Text',
        content: resolved ?? `{{${(node as TextVarNode).identifier}}}`,
        location: node.location
      };
    } 
    else if (node.type === 'DataVar') {
      const resolved = this.resolveDataVar(node as DataVarNode, context);
      return {
        type: 'Text',
        content: resolved ?? `{{${this.formatDataVarReference(node as DataVarNode)}}}`,
        location: node.location
      };
    }
    // If this is a text node, process any variable references within it
    else if (node.type === 'Text') {
      return this.resolveTextContent(node, context);
    } 
    // Other node types remain unchanged
    else {
      return node;
    }
  }

  /**
   * Resolves a TextVar node to its string value
   */
  private resolveTextVar(node: TextVarNode, context: ResolutionContext): string | undefined {
    const identifier = node.identifier;
    try {
      // Look up the variable in the context
      const value = this.resolveInContext(identifier, context);
      
      // If we found a value, return it as a string
      if (value !== undefined) {
        return this.formatValue(value);
      }
      
      // If not found, return undefined to indicate resolution failed
      return undefined;
    } catch (error) {
      if (context.strictMode) {
        throw new MeldResolutionError(
          `Failed to resolve text variable "${identifier}"`,
          { cause: error, node }
        );
      }
      return undefined;
    }
  }

  /**
   * Resolves a DataVar node to its string value
   */
  private resolveDataVar(node: DataVarNode, context: ResolutionContext): string | undefined {
    const identifier = node.identifier;
    const fields = node.fields || [];
    
    try {
      // First get the base value
      let value = this.resolveInContext(identifier, context);
      if (value === undefined) {
        return undefined;
      }
      
      // Then navigate through fields/indices
      for (const field of fields) {
        if (value === undefined) {
          return undefined;
        }
        
        // Both field and index access use the same pattern in JavaScript
        value = value[field.value];
      }
      
      // Format the final value appropriately
      return this.formatValue(value);
    } catch (error) {
      if (context.strictMode) {
        throw new MeldResolutionError(
          `Failed to resolve data variable "${this.formatDataVarReference(node)}"`,
          { cause: error, node }
        );
      }
      return undefined;
    }
  }

  /**
   * Resolves variable references within text content
   */
  private resolveTextContent(node: MeldNode, context: ResolutionContext): MeldNode {
    // This is a simplified example - in a real implementation you'd parse the text
    // to find variable references within it and replace them
    return node;
  }

  /**
   * Resolves a variable in the current context
   */
  private resolveInContext(identifier: string, context: ResolutionContext): any {
    // Check in local variables first
    if (context.hasVariable(identifier)) {
      return context.getVariable(identifier);
    }
    
    // Then in environment variables
    if (identifier === 'HOMEPATH') {
      return process.env.HOME || process.env.USERPROFILE || '';
    }
    if (identifier === 'PROJECTPATH') {
      return context.projectPath || '';
    }
    
    // Not found
    return undefined;
  }

  /**
   * Formats a variable reference for error messages
   */
  private formatDataVarReference(node: DataVarNode): string {
    const fields = node.fields || [];
    let result = node.identifier;
    
    for (const field of fields) {
      if (field.type === 'field') {
        result += `.${field.value}`;
      } else if (field.type === 'index') {
        result += `[${field.value}]`;
      }
    }
    
    return result;
  }

  /**
   * Formats a value as a string appropriately based on its type
   */
  private formatValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return '';
    
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    
    if (Array.isArray(value)) {
      // Format arrays by converting each item and joining with commas
      return value.map(v => this.formatValue(v)).join(', ');
    }
    
    if (typeof value === 'object') {
      // For objects, use a readable JSON format
      try {
        // For most object display, a simple string representation is best
        // In a full implementation, you might want special handling for certain types
        return JSON.stringify(value);
      } catch (e) {
        return '[Object]';
      }
    }
    
    // Fallback - just convert to string
    return String(value);
  }
} 