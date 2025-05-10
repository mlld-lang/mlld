/**
 * Type generation utilities for AST nodes
 */
import type { DirectiveNode } from '@grammar/types/base';
import { analyzeStructure, inferType } from '../analyze';

/**
 * Generate a TypeScript interface for a directive node
 */
export function generateTypeInterface(node: DirectiveNode): string {
  const { kind, subtype } = node;
  const typeName = `${capitalize(kind)}${capitalize(subtype)}DirectiveNode`;
  
  // Generate interface content
  let interfaceContent = '';
  
  // Add imports
  interfaceContent += `import { DirectiveNode, TypedDirectiveNode } from '@grammar/types/base';\n`;
  interfaceContent += `import { ContentNodeArray, VariableNodeArray } from '@grammar/types/values';\n\n`;
  
  // Add interface declaration
  interfaceContent += `/**\n * ${typeName}\n */\n`;
  interfaceContent += `export interface ${typeName} extends TypedDirectiveNode<'${kind}', '${subtype}'> {\n`;
  
  // Add values
  interfaceContent += `  values: {\n`;
  Object.entries(node.values || {}).forEach(([key, value]) => {
    const valueType = inferType(value);
    interfaceContent += `    ${key}: ${valueType};\n`;
  });
  interfaceContent += `  };\n\n`;
  
  // Add raw
  interfaceContent += `  raw: {\n`;
  Object.entries(node.raw || {}).forEach(([key]) => {
    interfaceContent += `    ${key}: string;\n`;
  });
  interfaceContent += `  };\n\n`;
  
  // Add meta
  interfaceContent += `  meta: {\n`;
  Object.entries(node.meta || {}).forEach(([key, value]) => {
    const metaType = typeof value === 'object' ? 
      '{ [key: string]: any }' : typeof value;
    interfaceContent += `    ${key}: ${metaType};\n`;
  });
  interfaceContent += `  };\n`;
  
  // Close interface
  interfaceContent += `}\n`;
  
  // Add type guard
  interfaceContent += `\n/**\n * Type guard for ${typeName}\n */\n`;
  interfaceContent += `export function is${typeName}(node: DirectiveNode): node is ${typeName} {\n`;
  interfaceContent += `  return node.kind === '${kind}' && node.subtype === '${subtype}';\n`;
  interfaceContent += `}\n`;
  
  return interfaceContent;
}

/**
 * Generate a base interface for a directive kind
 */
export function generateBaseTypeInterface(kind: string, subtypes: string[]): string {
  const typeName = `${capitalize(kind)}DirectiveNode`;
  const subtypeUnion = subtypes.map(s => `'${s}'`).join(' | ');
  
  // Generate interface content
  let interfaceContent = '';
  
  // Add imports
  interfaceContent += `import { DirectiveNode, TypedDirectiveNode } from '@grammar/types/base';\n`;
  interfaceContent += `import { ContentNodeArray, VariableNodeArray } from '@grammar/types/values';\n\n`;
  
  // Add interface declaration
  interfaceContent += `/**\n * Base ${typeName}\n */\n`;
  interfaceContent += `export interface ${typeName} extends TypedDirectiveNode<'${kind}', ${subtypeUnion}> {\n`;
  interfaceContent += `  // Common properties for all ${kind} directives\n`;
  interfaceContent += `}\n`;
  
  return interfaceContent;
}

/**
 * Generate a type file with combined interfaces for a directive kind
 */
export function generateTypeFile(nodes: DirectiveNode[]): string {
  if (nodes.length === 0) {
    return '';
  }
  
  // Group nodes by kind
  const nodesByKind = groupByKind(nodes);
  
  let fileContent = '';
  
  // Process each kind
  for (const [kind, kindNodes] of Object.entries(nodesByKind)) {
    const subtypes = kindNodes.map(node => node.subtype);
    
    // Add base interface
    fileContent += generateBaseTypeInterface(kind, subtypes);
    fileContent += '\n';
    
    // Add specific interfaces for each subtype
    kindNodes.forEach(node => {
      fileContent += generateTypeInterface(node);
      fileContent += '\n';
    });
  }
  
  return fileContent;
}

/**
 * Helper function to capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Group nodes by their kind
 */
function groupByKind(nodes: DirectiveNode[]): Record<string, DirectiveNode[]> {
  const result: Record<string, DirectiveNode[]> = {};
  
  nodes.forEach(node => {
    if (!result[node.kind]) {
      result[node.kind] = [];
    }
    
    result[node.kind].push(node);
  });
  
  return result;
}