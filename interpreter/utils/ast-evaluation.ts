/**
 * Shared utilities for AST node evaluation and JSON serialization
 */

/**
 * Creates a JSON replacer function that properly handles AST nodes
 * This is used to ensure consistent serialization across the codebase
 */
export function createASTAwareJSONReplacer() {
  return (key: string, val: any): any => {
    // Handle wrapped strings (quotes, backticks, brackets)
    if (val && typeof val === 'object' && 'wrapperType' in val && 'content' in val && Array.isArray(val.content)) {
      // Extract the string content from wrapped strings
      if (val.content.length > 0 && val.content[0].type === 'Text') {
        return val.content[0].content;
      }
      // TODO: Handle interpolated content in wrapped strings
    }
    
    // Handle raw Text nodes
    if (val && typeof val === 'object' && val.type === 'Text' && 'content' in val) {
      return val.content;
    }
    
    // Convert VariableReference nodes to their string representation
    if (val && typeof val === 'object' && val.type === 'VariableReference' && val.identifier) {
      return `@${val.identifier}`;
    }
    
    // Convert nested DataObject types to plain objects
    if (val && typeof val === 'object' && val.type === 'object' && val.properties) {
      return val.properties;
    }
    
    // Convert nested DataArray types to plain arrays
    if (val && typeof val === 'object' && val.type === 'array' && val.items) {
      return val.items;
    }
    
    // Hide raw executable details in JSON output
    if (val && typeof val === 'object' && val.__executable) {
      const params = val.paramNames || [];
      return `<function(${params.join(', ')})>`;
    }
    
    // Handle executable variables
    if (val && typeof val === 'object' && val.type === 'executable') {
      const def = val.value || val.definition || {};
      const params = def.paramNames || [];
      return `<function(${params.join(', ')})>`;
    }
    
    return val;
  };
}

/**
 * Evaluates a node to extract its runtime value
 * Handles wrapped strings and Text nodes that may not be fully evaluated
 */
export async function evaluateNodeToValue(node: any, env?: any): Promise<any> {
  if (!node || typeof node !== 'object') {
    return node;
  }
  
  // Handle wrapped strings
  if ('wrapperType' in node && 'content' in node && Array.isArray(node.content)) {
    if (node.content.length > 0 && node.content[0].type === 'Text') {
      return node.content[0].content;
    }
    // If we have an env and interpolate function, use it for complex content
    if (env && node.content.length > 0) {
      const { interpolate } = await import('../core/interpreter');
      return await interpolate(node.content, env);
    }
  }
  
  // Handle raw Text nodes
  if (node.type === 'Text' && 'content' in node) {
    return node.content;
  }
  
  return node;
}