# Strategic Type System Design for Mlld Grammar AST

This document outlines a comprehensive strategy for implementing a clean-slate type system that perfectly aligns with the AST produced by the Mlld grammar.

## Design Principles

1. **AST-First Design**: Base all types directly on the actual AST structure
2. **Strong Type Safety**: Leverage TypeScript's advanced type features for precise typing
3. **Consistency**: Create uniform patterns across all directives
4. **Discoverability**: Make types self-documenting and intuitive
5. **Modularity**: Design for easy extension and maintenance

## Architectural Approach

A layered type architecture that mirrors the structured nature of the AST:

### 1. Base Types Layer

```typescript
// base-types.ts
export type NodeType = 
  | 'Directive'
  | 'Text'
  | 'VariableReference'
  | 'Number'
  | 'PathSeparator'
  | 'DotSeparator';

export type DirectiveKind = 
  | 'text' 
  | 'run' 
  | 'add' 
  | 'import'
  | 'path'
  | 'data'
  | 'exec';

// The foundation for all nodes
export interface Node {
  readonly nodeId: string;
  type: NodeType;
  location?: SourceLocation;
}

// Basic node types with strong typing
export interface TextNode extends Node {
  type: 'Text';
  content: string;
}

export interface NumberNode extends Node {
  type: 'Number';
  value: number;
  raw: string;
}

export interface VariableReferenceNode extends Node {
  type: 'VariableReference';
  identifier: string;
  valueType: string;
  isVariableReference: true;
  // Optional properties based on context
  alias?: string;
  fields?: Array<{ type: 'field' | 'index', value: string | number }>;
}

// Base directive structure that all directives follow
export interface DirectiveNode<K extends DirectiveKind, S extends string> extends Node {
  type: 'Directive';
  kind: K;
  subtype: S;
  values: Record<string, Node[]>;
  raw: Record<string, string | string[]>;
  meta: Record<string, unknown>;
  source?: string;
}
```

### 2. Value Type Layer

```typescript
// value-types.ts
import { TextNode, VariableReferenceNode, PathSeparatorNode, DotSeparatorNode, NumberNode } from './base-types';

// Standardized array types used throughout the system
export type ContentNodeArray = Array<TextNode | VariableReferenceNode>;
export type PathNodeArray = Array<TextNode | PathSeparatorNode | DotSeparatorNode | VariableReferenceNode>;
export type IdentifierNodeArray = Array<VariableReferenceNode>;
export type NumberNodeArray = Array<NumberNode>;

// Common value structures shared across directives
export interface PathValue {
  path: PathNodeArray;
}

export interface IdentifierValue {
  identifier: IdentifierNodeArray;
}

export interface ContentValue {
  content: ContentNodeArray;
}

export interface HeaderValue {
  headerLevel: NumberNodeArray;
  underHeader?: TextNode[];
}
```

### 3. Directive-Specific Types Layer

Example for the Text directive:

```typescript
// text-directive.ts
import { DirectiveNode } from './base-types';
import { ContentNodeArray, IdentifierNodeArray } from './value-types';

// Subtypes specific to text directive
export type TextSubtype = 'textAssignment' | 'textTemplate';

// Source types for text directive
export type TextSource = 'literal' | 'template' | 'directive' | 'run' | 'add';

// Metadata specific to text directive
export interface TextMeta {
  sourceType: TextSource;
  hasVariables?: boolean;
  isTemplateContent?: boolean;
  directive?: 'run' | 'add';
  run?: {
    isCommand?: boolean;
    isCommandRef?: boolean;
    commandName?: string;
    language?: string;
    isMultiLine?: boolean;
  };
  add?: Record<string, unknown>;
  path?: {
    hasVariables: boolean;
    isAbsolute?: boolean;
    hasExtension?: boolean;
    extension?: string;
  };
}

// Raw values specific to text directive
export interface TextRaw {
  identifier: string;
  content: string;
}

// Base text directive node
export interface TextDirectiveNode extends DirectiveNode<'text', TextSubtype> {
  values: {
    identifier: IdentifierNodeArray;
    content: ContentNodeArray | DirectiveNode<any, any>; // Can be content or nested directive
  };
  raw: TextRaw;
  meta: TextMeta;
  source: TextSource;
}

// Specific subtype nodes with precise typing
export interface TextAssignmentNode extends TextDirectiveNode {
  subtype: 'textAssignment';
}

export interface TextTemplateNode extends TextDirectiveNode {
  subtype: 'textTemplate';
}

// Type guards
export function isTextDirective(node: any): node is TextDirectiveNode {
  return node?.type === 'Directive' && node?.kind === 'text';
}

export function isTextTemplate(node: any): node is TextTemplateNode {
  return isTextDirective(node) && node.subtype === 'textTemplate';
}

export function isTextAssignment(node: any): node is TextAssignmentNode {
  return isTextDirective(node) && node.subtype === 'textAssignment';
}

export function hasNestedDirective(node: TextDirectiveNode): boolean {
  return Array.isArray(node.values.content) === false;
}
```

### 4. Context and Reference Types

```typescript
// context-types.ts

// RHS context marker interface
export interface RHSContext {
  isRHSRef: true;
}

// Type helper to add RHS context to any directive
export type AsRHSContext<T> = T & { meta: T['meta'] & RHSContext };

// Helper for directive references in RHS contexts
export interface DirectiveReference<K extends DirectiveKind, S extends string> {
  kind: K;
  subtype: S;
  values: Record<string, Node[]>;
  raw: Record<string, string>;
  meta: Record<string, unknown> & { isRHSRef: true };
}
```

## Implementation Strategy

To implement this type system effectively:

### 1. Generate Type Skeletons from AST

Create a "type explorer" utility that:
- Parses sample directives using your grammar
- Outputs the resulting AST structure
- Automatically generates TypeScript interfaces that match

```typescript
// Sample type generation pseudocode
function generateTypeFromAST(ast, typeName) {
  const properties = Object.keys(ast).map(key => {
    const value = ast[key];
    const typeOfValue = inferType(value);
    return `${key}: ${typeOfValue};`;
  });
  
  return `export interface ${typeName} {\n  ${properties.join('\n  ')}\n}`;
}
```

### 2. Refine Generated Types

After generating the base types:
- Add proper type annotations and constraints
- Create union types for common patterns
- Add JSDoc comments to document each type

### 3. Build Type Hierarchy

Organize types into a logical hierarchy:
- Base node types at the foundation
- Common value types in the middle layer
- Directive-specific types at the highest layer

### 4. Add Utility Types and Guards

Create a comprehensive set of utility types and guards:
- Type predicates for checking node types
- Helper types for transformation operations
- Utility functions for common operations

### 5. Test Type Coverage

Implement comprehensive type tests:
- Parse sample directives and verify type alignment
- Test edge cases and variant combinations
- Ensure all AST structures are correctly typed

## Directory Structure

```
grammar/
  types/
    index.ts            # Main exports
    base-types.ts       # Foundational node types
    value-types.ts      # Common value structures
    meta-types.ts       # Metadata type definitions
    
    directives/         # Directive-specific types
      text-directive.ts
      run-directive.ts
      add-directive.ts
      import-directive.ts
      path-directive.ts
      data-directive.ts
      exec-directive.ts
    
    utils/             # Type utilities and guards
      type-guards.ts
      type-assertions.ts
      type-transformations.ts
    
    context/           # Context-specific types
      rhs-context.ts   # RHS context types
```

## Benefits of This Approach

1. **Perfect AST Alignment**: Types directly mirror the actual AST structure
2. **Strong Type Safety**: Precise typing for all node variants
3. **Developer Friendly**: Clear organization and intuitive naming
4. **Self-Documenting**: Rich JSDoc comments explain purpose and relationships
5. **Maintainable**: Modular design makes updates and extensions easier
6. **Performance**: Optimized for TypeScript's type checking system