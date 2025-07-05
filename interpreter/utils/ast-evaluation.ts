/**
 * Shared utilities for AST node evaluation and JSON serialization
 */

import type { MlldNode } from '@core/types';
import type { Environment } from '../env/Environment';

/**
 * Creates a JSON replacer function that properly handles AST nodes
 * This is used to ensure consistent serialization across the codebase
 */
export function createASTAwareJSONReplacer() {
  const replacer = (key: string, val: unknown): unknown => {
    // Handle wrapped strings (quotes, backticks, brackets)
    if (val && typeof val === 'object' && 'wrapperType' in val && 'content' in val) {
      const valWithContent = val as { wrapperType: string; content: unknown[] };
      if (Array.isArray(valWithContent.content)) {
        // Extract the string content from wrapped strings
        if (valWithContent.content.length > 0) {
          const firstItem = valWithContent.content[0];
          if (firstItem && typeof firstItem === 'object' && 'type' in firstItem && 'content' in firstItem) {
            const textNode = firstItem as { type: string; content: string };
            if (textNode.type === 'Text') {
              return textNode.content;
            }
          }
        }
        // Handle empty content - return empty string instead of the wrapper object
        if (valWithContent.content.length === 0) {
          return '';
        }
      }
      // TODO: Handle interpolated content in wrapped strings
      return ''; // Fallback for unhandled content
    }
    
    // Handle raw Text nodes
    if (val && typeof val === 'object' && 'type' in val && 'content' in val) {
      const textNode = val as { type: string; content: string };
      if (textNode.type === 'Text') {
        return textNode.content;
      }
    }
    
    // Convert VariableReference nodes to their string representation
    if (val && typeof val === 'object' && 'type' in val && 'identifier' in val) {
      const varRef = val as { type: string; identifier: string };
      if (varRef.type === 'VariableReference') {
        return `@${varRef.identifier}`;
      }
    }
    
    // Convert nested DataObject types to plain objects
    if (val && typeof val === 'object' && 'type' in val && 'properties' in val) {
      const dataObj = val as { type: string; properties: Record<string, unknown> };
      if (dataObj.type === 'object') {
        return dataObj.properties;
      }
    }
    
    // Convert nested DataArray types to plain arrays
    if (val && typeof val === 'object' && 'type' in val && 'items' in val) {
      const dataArr = val as { type: string; items: unknown[] };
      if (dataArr.type === 'array') {
        return dataArr.items;
      }
    }
    
    // Hide raw executable details in JSON output
    if (val && typeof val === 'object' && '__executable' in val) {
      const execVal = val as { __executable: boolean; paramNames?: string[] };
      const params = execVal.paramNames || [];
      return `<function(${params.join(', ')})>`;
    }
    
    // Handle executable variables
    if (val && typeof val === 'object' && 'type' in val) {
      const typeVal = val as { type: string; value?: unknown; definition?: unknown };
      if (typeVal.type === 'executable') {
        const def = typeVal.value || typeVal.definition || {};
        const params = (def as { paramNames?: string[] }).paramNames || [];
        return `<function(${params.join(', ')})>`;
      }
    }
    
    // Handle plain objects that might contain wrapped values
    // This is important for objects in arrays that don't have a 'type' property
    if (val && typeof val === 'object' && val.constructor === Object && !('type' in val)) {
      // Check if any property has wrapped content
      const hasWrappedContent = Object.values(val).some(v => 
        v && typeof v === 'object' && 'wrapperType' in v && 'content' in v
      );
      
      if (hasWrappedContent) {
        // Process the object's properties
        const processed: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val)) {
          processed[k] = replacer(k, v); // Recursively call the replacer
        }
        return processed;
      }
    }
    
    return val;
  };
  
  return replacer;
}

/**
 * Evaluates a node to extract its runtime value
 * Handles wrapped strings and Text nodes that may not be fully evaluated
 */
export async function evaluateNodeToValue(node: unknown, env?: Environment): Promise<unknown> {
  if (!node || typeof node !== 'object') {
    return node;
  }
  
  // Handle wrapped strings
  if ('wrapperType' in node && 'content' in node) {
    const wrappedNode = node as { wrapperType: string; content: unknown[] };
    if (Array.isArray(wrappedNode.content)) {
      if (wrappedNode.content.length > 0) {
        const firstItem = wrappedNode.content[0];
        if (firstItem && typeof firstItem === 'object' && 'type' in firstItem && 'content' in firstItem) {
          const textNode = firstItem as { type: string; content: string };
          if (textNode.type === 'Text') {
            return textNode.content;
          }
        }
      }
      // If we have an env and interpolate function, use it for complex content
      if (env && wrappedNode.content.length > 0) {
        const { interpolate } = await import('../core/interpreter');
        return await interpolate(wrappedNode.content as MlldNode[], env);
      }
    }
  }
  
  // Handle raw Text nodes
  if ('type' in node && 'content' in node) {
    const textNode = node as { type: string; content: string };
    if (textNode.type === 'Text') {
      return textNode.content;
    }
  }
  
  return node;
}