# Type Generation System Design

This document provides a detailed design for the type generation system, which is a core component of our grammar-driven development approach. It outlines the technical architecture, algorithms, and integration patterns needed to generate accurate TypeScript types from our grammar's AST.

## System Architecture

The type generation system consists of these key components:

### 1. AST Parser Adapter

Provides a standardized interface to the grammar parser:

```typescript
interface ASTParserAdapter {
  /**
   * Parse a directive string into an AST node
   */
  parseDirective(directive: string): DirectiveNode;
  
  /**
   * Parse a file containing multiple directives
   */
  parseFile(filePath: string): DirectiveNode[];
  
  /**
   * Get parser metadata (supported directives, etc.)
   */
  getParserMetadata(): ParserMetadata;
}
```

### 2. Type Analyzer

Analyzes AST structures to determine types:

```typescript
interface TypeAnalyzer {
  /**
   * Analyze an AST node and determine its TypeScript type
   */
  analyzeNode(node: any, context?: AnalysisContext): TypeInfo;
  
  /**
   * Determine common type for array elements
   */
  analyzeArrayElements(elements: any[]): TypeInfo;
  
  /**
   * Check if a property appears to be optional
   */
  isOptionalProperty(propName: string, samples: any[]): boolean;
}
```

### 3. Type Generator

Generates TypeScript interfaces and types:

```typescript
interface TypeGenerator {
  /**
   * Generate a TypeScript interface for a node type
   */
  generateInterface(typeName: string, typeInfo: TypeInfo): string;
  
  /**
   * Generate a type guard function for a node type
   */
  generateTypeGuard(typeName: string, typeInfo: TypeInfo): string;
  
  /**
   * Generate complete type definition files
   */
  generateTypeDefinitionFile(types: Map<string, TypeInfo>): string;
}
```

### 4. Manual Enhancement Preservers

Manages manually added enhancements to generated types:

```typescript
interface ManualEnhancementPreserver {
  /**
   * Extract manual enhancements from existing file
   */
  extractManualEnhancements(filePath: string): ManualEnhancements;
  
  /**
   * Merge manual enhancements with newly generated types
   */
  mergeWithGenerated(generated: string, enhancements: ManualEnhancements): string;
  
  /**
   * Detect conflicts between manual enhancements and generated types
   */
  detectConflicts(generated: TypeInfo, enhancements: ManualEnhancements): Conflict[];
}
```

## Type Inference Algorithm

The core of the system is the type inference algorithm:

### Basic Type Inference

```typescript
function inferType(value: any, context: TypeContext = {}): TypeInfo {
  // Handle null/undefined
  if (value === null) return { kind: "null" };
  if (value === undefined) return { kind: "undefined" };
  
  // Handle arrays
  if (Array.isArray(value)) {
    const elementTypes = value.map(elem => inferType(elem, context));
    return {
      kind: "array",
      elementType: mergeTypes(elementTypes)
    };
  }
  
  // Handle objects
  if (typeof value === "object") {
    const properties: PropertyInfo[] = [];
    
    for (const [key, val] of Object.entries(value)) {
      properties.push({
        name: key,
        type: inferType(val, context),
        optional: context.detectOptional ? isOptionalAcrossSamples(key, context.samples) : false
      });
    }
    
    return {
      kind: "object",
      properties
    };
  }
  
  // Handle primitives
  return { kind: typeof value as "string" | "number" | "boolean" };
}
```

### Type Merging

```typescript
function mergeTypes(types: TypeInfo[]): TypeInfo {
  // If all types are the same, return that type
  if (types.every(t => t.kind === types[0].kind)) {
    if (types[0].kind === "object") {
      // Merge object properties
      return mergeObjectTypes(types as ObjectTypeInfo[]);
    }
    if (types[0].kind === "array") {
      // Merge array element types
      return {
        kind: "array",
        elementType: mergeTypes(types.map(t => (t as ArrayTypeInfo).elementType))
      };
    }
    return types[0];
  }
  
  // Different types, create a union
  return {
    kind: "union",
    types: deduplicateTypes(types)
  };
}
```

### Specialized Node Type Detection

```typescript
function detectNodeType(node: any): NodeTypeInfo | null {
  // Check if it's a directive node
  if (node.type === "Directive" && typeof node.kind === "string") {
    return {
      kind: "node",
      nodeType: "Directive",
      directiveKind: node.kind,
      directiveSubtype: node.subtype
    };
  }
  
  // Check other node types
  if (
    node.type && 
    ["Text", "VariableReference", "Number", "PathSeparator", "DotSeparator"].includes(node.type)
  ) {
    return {
      kind: "node",
      nodeType: node.type
    };
  }
  
  return null;
}
```

## Interface Generation

The system generates different types of TypeScript code:

### Basic Interface Generation

```typescript
function generateInterface(info: ObjectTypeInfo, name: string): string {
  const properties = info.properties.map(prop => {
    const typeStr = typeInfoToString(prop.type);
    return `  ${prop.name}${prop.optional ? '?' : ''}: ${typeStr};`;
  });
  
  return `interface ${name} {\n${properties.join('\n')}\n}`;
}
```

### Directive-Specific Interfaces

```typescript
function generateDirectiveInterface(
  info: NodeTypeInfo, 
  name: string, 
  values: ObjectTypeInfo,
  raw: ObjectTypeInfo,
  meta: ObjectTypeInfo
): string {
  return `export interface ${name} extends DirectiveNode<'${info.directiveKind}', '${info.directiveSubtype}'> {
  values: ${generateInlineInterface(values)};
  raw: ${generateInlineInterface(raw)};
  meta: ${generateInlineInterface(meta)};
  source: ${info.source ? `'${info.source}'` : 'string'};
}`;
}
```

### Type Guards

```typescript
function generateTypeGuard(name: string, info: NodeTypeInfo): string {
  let condition = `node?.type === '${info.nodeType}'`;
  
  if (info.nodeType === 'Directive') {
    condition += ` && node?.kind === '${info.directiveKind}'`;
    
    if (info.directiveSubtype) {
      condition += ` && node?.subtype === '${info.directiveSubtype}'`;
    }
  }
  
  return `export function is${name}(node: any): node is ${name} {
  return ${condition};
}`;
}
```

## Manual Enhancement System

The system preserves manual additions to generated code:

### Marker Comments

```typescript
const MANUAL_START_MARKER = '// @manual-addition';
const MANUAL_END_MARKER = '// @end-manual-addition';
```

### Extraction Algorithm

```typescript
function extractManualEnhancements(code: string): ManualEnhancement[] {
  const enhancements: ManualEnhancement[] = [];
  let currentEnhancement: { start: number; content: string } | null = null;
  
  const lines = code.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.trim() === MANUAL_START_MARKER) {
      currentEnhancement = { start: i, content: '' };
    } else if (line.trim() === MANUAL_END_MARKER && currentEnhancement) {
      enhancements.push({
        startLine: currentEnhancement.start,
        endLine: i,
        content: currentEnhancement.content
      });
      currentEnhancement = null;
    } else if (currentEnhancement) {
      currentEnhancement.content += line + '\n';
    }
  }
  
  return enhancements;
}
```

### Merging Algorithm

```typescript
function mergeEnhancements(generated: string, enhancements: ManualEnhancement[]): string {
  let result = generated;
  
  // Sort enhancements in reverse order to handle insertion without affecting indices
  const sortedEnhancements = [...enhancements].sort((a, b) => b.locationHint.localeCompare(a.locationHint));
  
  for (const enhancement of sortedEnhancements) {
    const insertPosition = findInsertPosition(result, enhancement.locationHint);
    
    if (insertPosition !== -1) {
      result = 
        result.substring(0, insertPosition) + 
        `\n${MANUAL_START_MARKER}\n${enhancement.content}\n${MANUAL_END_MARKER}\n` +
        result.substring(insertPosition);
    }
  }
  
  return result;
}
```

## Complete Workflow

Here's the complete workflow for type generation:

1. **Parse Directives**:
   - Parse sample directives to get AST nodes
   - Collect metadata about node structure

2. **Analyze Types**:
   - Infer types for each node and its properties
   - Detect common patterns and specializations
   - Build type relationships

3. **Extract Existing Manual Enhancements**:
   - Parse existing type files
   - Extract manually added code blocks
   - Record their locations and context

4. **Generate New Type Files**:
   - Generate interfaces for all node types
   - Create type guards and utilities
   - Structure into appropriate files

5. **Merge Manual Enhancements**:
   - Add back manually enhanced sections
   - Resolve conflicts with new structure
   - Preserve developer additions

6. **Write Output Files**:
   - Write merged files to the type system
   - Generate index files for exports
   - Create documentation from types

## Integration with Development Workflow

The type generation system integrates with development in several ways:

### Watch Mode

```typescript
async function watchMode(config: WatchConfig): Promise<void> {
  const watcher = chokidar.watch(config.grammarFiles, {
    persistent: true
  });
  
  watcher.on('change', async (path) => {
    console.log(`Grammar file changed: ${path}`);
    await regenerateTypes(config);
  });
  
  console.log('Watching for grammar changes...');
}
```

### VSCode Extension Integration

```typescript
function activateVSCodeExtension(context: vscode.ExtensionContext) {
  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('mlldGrammar.generateTypes', () => {
      return generateTypes();
    })
  );
  
  // Add language server capabilities
  const client = new LanguageClient(
    'mlldGrammar',
    'Mlld Grammar Language Server',
    serverOptions,
    clientOptions
  );
  
  client.start();
}
```

### CI/CD Integration

```yaml
# GitHub Action for type validation
name: Validate Types

on:
  push:
    paths:
      - 'grammar/**'
      - 'types/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm ci
      - run: npm run validate-types
```

## Future Enhancements

Potential future enhancements to the system:

1. **Intelligent Type Refinement**:
   - Machine learning to suggest better type structures
   - Pattern recognition for common AST structures
   - Automatic constraint detection

2. **Interactive Type Explorer**:
   - Visual editor for type refinements
   - Interactive diagram of type relationships
   - Live preview of generated types

3. **Cross-Language Support**:
   - Generate types for multiple languages (Flow, JSDoc, etc.)
   - Create runtime validation code
   - Generate serialization/deserialization utilities

4. **Schema Generation**:
   - JSON Schema for AST validation
   - GraphQL schema generation
   - API specification generation

## Conclusion

The type generation system is a cornerstone of our grammar-driven development approach. By automating the creation and maintenance of types from the AST, we ensure perfect alignment between our grammar implementation and type system, while still allowing for developer refinements and specializations.

This system will dramatically improve development efficiency, type safety, and documentation quality, while reducing the risk of type/implementation mismatches.