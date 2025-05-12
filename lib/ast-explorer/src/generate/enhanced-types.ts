/**
 * Enhanced type generation utilities for AST nodes
 * 
 * This module provides improved type generation that properly consolidates
 * AST nodes by directive kind and subtype, creating appropriate discriminated unions.
 */
import type { DirectiveNode } from '../parse.js';
import { analyzeStructure, inferType } from '../analyze.js';
import * as path from 'path';
import type { IFileSystemAdapter } from '../explorer.js';
import { nodeFsAdapter } from '../fs-adapter.js';

/**
 * Enhanced DirectiveNode storage for efficient type generation
 */
interface DirectiveTypeStorage {
  // Stores all unique nodes by kind and subtype
  nodesByKindAndSubtype: Record<string, Record<string, DirectiveNode>>;
  
  // Maps kind to its subtypes
  kindToSubtypes: Record<string, Set<string>>;
  
  // Tracks which base types (non-directive) we need to generate
  baseTypes: Set<string>;
}

/**
 * Generate enhanced type structure from directive nodes
 * 
 * @param directives All directives extracted from examples
 * @param outputDir Directory where types will be written
 * @param fileSystem Optional file system adapter
 */
export function generateEnhancedTypes(
  directives: DirectiveNode[],
  outputDir: string,
  fileSystem?: IFileSystemAdapter
): void {
  const fs = fileSystem || nodeFsAdapter;
  
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });
  
  // Create a type storage to organize our nodes
  const typeStorage = analyzeDirectives(directives);
  
  // Generate base types
  generateBaseTypes(typeStorage, outputDir, fs);
  
  // Generate directive types (by kind and subtype)
  generateDirectiveTypes(typeStorage, outputDir, fs);
  
  // Generate unions and the main directive union
  generateUnionTypes(typeStorage, outputDir, fs);
  
  console.log(`Enhanced type generation complete - generated ${
    Object.keys(typeStorage.kindToSubtypes).length
  } directive kinds and ${
    Object.values(typeStorage.kindToSubtypes).reduce(
      (total, subtypes) => total + subtypes.size, 0
    )
  } directive subtypes`);
}

/**
 * Analyze directives and organize them by kind and subtype
 */
function analyzeDirectives(directives: DirectiveNode[]): DirectiveTypeStorage {
  const storage: DirectiveTypeStorage = {
    nodesByKindAndSubtype: {},
    kindToSubtypes: {},
    baseTypes: new Set(['BaseNode', 'BaseDirectiveNode', 'BaseVariableNode'])
  };
  
  // Process each directive
  for (const node of directives) {
    const { kind, subtype } = node;
    
    // Skip if node is missing kind or subtype
    if (!kind || !subtype) continue;
    
    // Initialize structures if needed
    if (!storage.nodesByKindAndSubtype[kind]) {
      storage.nodesByKindAndSubtype[kind] = {};
      storage.kindToSubtypes[kind] = new Set();
    }
    
    // Store the node by kind and subtype (only keep one per subtype)
    // We only need one example per subtype for the interface
    storage.nodesByKindAndSubtype[kind][subtype] = node;
    storage.kindToSubtypes[kind].add(subtype);
    
    // Track the base types used by analyzing node structure
    if (node.values) {
      Object.values(node.values).forEach(value => {
        if (Array.isArray(value)) {
          value.forEach(item => {
            if (item && typeof item === 'object' && item.type) {
              if (item.type === 'VariableReference') {
                storage.baseTypes.add('VariableReferenceNode');
              } else if (item.type === 'Text') {
                storage.baseTypes.add('TextNode');
              }
            }
          });
        }
      });
    }
  }
  
  return storage;
}

/**
 * Generate base type interfaces
 */
function generateBaseTypes(
  storage: DirectiveTypeStorage,
  outputDir: string,
  fs: IFileSystemAdapter
): void {
  // Generate BaseNode
  const baseNodeContent = `/**
 * Base node interface for all AST nodes
 */
export interface BaseNode {
  type: string;
}

/**
 * Text node interface
 */
export interface TextNode extends BaseNode {
  type: 'Text';
  content: string;
}

/**
 * Comment node interface
 */
export interface CommentNode extends BaseNode {
  type: 'Comment';
  content: string;
}

/**
 * CodeFence node interface
 */
export interface CodeFenceNode extends BaseNode {
  type: 'CodeFence';
  language?: string;
  content: string;
}

/**
 * Newline node interface
 */
export interface NewlineNode extends BaseNode {
  type: 'Newline';
  content: string;
}
`;

  // Generate BaseDirectiveNode
  const baseDirectiveContent = `import { BaseNode } from './base-node.js';

/**
 * Base interface for all directive nodes
 */
export interface BaseDirectiveNode extends BaseNode {
  type: 'Directive';
  kind: string;
  subtype: string;
  values: Record<string, any>;
  raw: Record<string, any>;
  meta: Record<string, any>;
}

/**
 * Typed directive node with specific kind and subtype
 */
export interface TypedDirectiveNode<K extends string, S extends string> extends BaseDirectiveNode {
  kind: K;
  subtype: S;
}
`;

  // Generate BaseVariableNode
  const baseVariableContent = `import { BaseNode } from './base-node.js';

/**
 * Base interface for variable nodes
 */
export interface BaseVariableNode extends BaseNode {
  identifier: string;
}

/**
 * Variable reference node interface
 */
export interface VariableReferenceNode extends BaseVariableNode {
  type: 'VariableReference';
  identifier: string;
  alias?: string | null;
}

/**
 * Variable interpolation node interface
 */
export interface VariableInterpolationNode extends BaseVariableNode {
  type: 'VariableInterpolation';
  identifier: string;
}
`;

  // Generate value types
  const valueTypesContent = `/**
 * Content node array type
 */
export type ContentNodeArray = any[];

/**
 * Variable node array type
 */
export type VariableNodeArray = any[];

/**
 * String value type
 */
export interface StringValue {
  type: 'string';
  value: string;
}

/**
 * Path value type
 */
export interface PathValue {
  type: 'path';
  value: string;
}
`;

  // Write the files
  fs.writeFileSync(path.join(outputDir, 'base-node.ts'), baseNodeContent);
  fs.writeFileSync(path.join(outputDir, 'base-directive.ts'), baseDirectiveContent);
  fs.writeFileSync(path.join(outputDir, 'base-variable.ts'), baseVariableContent);
  fs.writeFileSync(path.join(outputDir, 'values.ts'), valueTypesContent);
  
  console.log('Generated base type files');
}

/**
 * Generate type interfaces for each directive kind+subtype combination
 */
function generateDirectiveTypes(
  storage: DirectiveTypeStorage,
  outputDir: string, 
  fs: IFileSystemAdapter
): void {
  // Process each directive kind
  for (const [kind, subtypes] of Object.entries(storage.kindToSubtypes)) {
    // Process each subtype
    for (const subtype of subtypes) {
      const node = storage.nodesByKindAndSubtype[kind][subtype];
      
      // Skip if no node found for this subtype
      if (!node) continue;
      
      // Generate a proper type name
      const capitalizedKind = capitalize(kind);
      const capitalizedSubtype = capitalize(subtype);
      const typeName = `${capitalizedKind}${capitalizedSubtype}DirectiveNode`;
      
      // Create file name using kebab-case
      const fileName = `${kind}-${subtype.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.ts`;
      
      // Generate the content
      const content = generateDirectiveTypeInterface(node, typeName);
      
      // Write the file
      fs.writeFileSync(path.join(outputDir, fileName), content);
    }
  }
  
  console.log('Generated directive subtype interfaces');
}

/**
 * Generate union types for each directive kind
 */
function generateUnionTypes(
  storage: DirectiveTypeStorage,
  outputDir: string,
  fs: IFileSystemAdapter
): void {
  // Process each directive kind to create union types
  for (const [kind, subtypes] of Object.entries(storage.kindToSubtypes)) {
    const capitalizedKind = capitalize(kind);
    const unionTypeName = `${capitalizedKind}DirectiveNode`;
    
    // Generate imports for all subtypes
    const imports = Array.from(subtypes).map(subtype => {
      const capitalizedSubtype = capitalize(subtype);
      const typeName = `${capitalizedKind}${capitalizedSubtype}DirectiveNode`;
      const fileName = `${kind}-${subtype.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
      
      return `import { ${typeName} } from './${fileName}.js';`;
    }).join('\n');
    
    // Generate the union type
    const unionType = `
/**
 * Union type for all ${kind} directive nodes
 */
export type ${unionTypeName} = 
  ${Array.from(subtypes).map(subtype => {
    const capitalizedSubtype = capitalize(subtype);
    return `| ${capitalizedKind}${capitalizedSubtype}DirectiveNode`;
  }).join('\n  ')}
`;
    
    // Create the file content
    const content = `${imports}\n\n${unionType}`;
    
    // Write the file
    fs.writeFileSync(path.join(outputDir, `${kind}.ts`), content);
    
    console.log(`Generated union type for ${kind}`);
  }
  
  // Generate the main DirectiveNodeUnion
  const mainImports = Object.keys(storage.kindToSubtypes).map(kind => {
    const capitalizedKind = capitalize(kind);
    return `import { ${capitalizedKind}DirectiveNode } from './${kind}.js';`;
  }).join('\n');
  
  const mainUnion = `
/**
 * Union type for all directive nodes
 */
export type DirectiveNodeUnion = 
  ${Object.keys(storage.kindToSubtypes).map(kind => {
    const capitalizedKind = capitalize(kind);
    return `| ${capitalizedKind}DirectiveNode`;
  }).join('\n  ')}
`;
  
  // Create the file content
  const mainContent = `${mainImports}\n\n${mainUnion}`;
  
  // Write the file
  fs.writeFileSync(path.join(outputDir, 'directives.ts'), mainContent);
  
  console.log('Generated main DirectiveNodeUnion');
  
  // Create an index.ts file to export all types
  const indexContent = `// Base types
export * from './base-node.js';
export * from './base-directive.js';
export * from './base-variable.js';
export * from './values.js';

// Directive union
export * from './directives.js';

// Directive kind unions
${Object.keys(storage.kindToSubtypes).map(kind => 
  `export * from './${kind}.js';`
).join('\n')}

// Individual directive types
${Object.entries(storage.kindToSubtypes).flatMap(([kind, subtypes]) => 
  Array.from(subtypes).map(subtype => 
    `export * from './${kind}-${subtype.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.js';`
  )
).join('\n')}
`;
  
  fs.writeFileSync(path.join(outputDir, 'index.ts'), indexContent);
  
  console.log('Generated index.ts');
}

/**
 * Generate a TypeScript interface for a specific directive node
 */
function generateDirectiveTypeInterface(node: DirectiveNode, typeName: string): string {
  const { kind, subtype } = node;
  
  // Generate interface content
  let interfaceContent = '';
  
  // Add imports
  interfaceContent += `import { BaseDirectiveNode, TypedDirectiveNode } from './base-directive.js';\n`;
  interfaceContent += `import { ContentNodeArray, VariableNodeArray } from './values.js';\n\n`;
  
  // Add interface declaration
  interfaceContent += `/**\n * ${typeName} - ${kind} directive with ${subtype} subtype\n */\n`;
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
  interfaceContent += `export function is${typeName}(node: BaseDirectiveNode): node is ${typeName} {\n`;
  interfaceContent += `  return node.kind === '${kind}' && node.subtype === '${subtype}';\n`;
  interfaceContent += `}\n`;
  
  return interfaceContent;
}

/**
 * Helper function to capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}