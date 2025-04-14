# ContentResolution Service Type System Improvements

After analyzing the ContentResolution service code, I've identified several opportunities to strengthen the TypeScript type system for variable handling. These improvements will make the code more robust, easier to maintain, and less prone to runtime errors.

## 1. Structured Quote Types and String Literal Representation

### Current Issues
In the `StringLiteralHandler`, we see:
```typescript
private readonly QUOTE_TYPES = ["'", '"', '`'] as const;
// Later used with type assertions:
quoteType as typeof this.QUOTE_TYPES[number]
```

The code uses type assertions and array indexing to handle quote types, which is error-prone and lacks static type checking.

### Proposed Solution
```typescript
// Define a proper enum or union type for quotes
export type QuoteType = "'" | '"' | '`';

// Define a StringLiteral interface to properly model literals
export interface StringLiteral {
  value: string;
  quoteType: QuoteType;
  raw: string; // The original string including quotes
}

// Update the class to use these types
export class StringLiteralHandler {
  private readonly QUOTE_TYPES: readonly QuoteType[] = ["'", '"', '`'];
  
  // Methods now return or accept StringLiteral objects
  parseLiteral(raw: string): StringLiteral {
    this.validateLiteral(raw);
    const quoteType = raw[0] as QuoteType;
    const content = raw.slice(1, -1);
    const value = this.unescapeQuotes(content, quoteType);
    
    return { 
      value, 
      quoteType, 
      raw 
    };
  }
  
  // Other methods updated accordingly...
}
```

### Benefits
1. **Type Safety**: Explicit `QuoteType` union eliminates the need for type assertions
2. **Semantic Clarity**: `StringLiteral` interface clearly represents what a string literal is
3. **Data Integrity**: Preserves the original format, quote type, and parsed value together
4. **Consistency**: Aligns with the AST's StringLiteral node structure
5. **Maintainability**: Makes it easier to add new quote types or string literal features

## 2. Discriminated Union for AST Node Types

### Current Issues
The code uses type assertions and property checks to handle different node types:
```typescript
if (node.type === 'Directive' && (node as any).directive?.kind === 'text')
// And later:
resolvedParts.push((node as TextNode).content);
```

These type assertions bypass TypeScript's type checking and can lead to runtime errors.

### Proposed Solution
```typescript
// Define proper discriminated union types
type NodeType = 'Text' | 'Directive' | 'Comment' | 'CodeFence';

interface BaseNode {
  type: NodeType;
  // Common properties
}

interface TextNodeType extends BaseNode {
  type: 'Text';
  content: string;
}

interface DirectiveNodeType extends BaseNode {
  type: 'Directive';
  directive: {
    kind: string;
    value: string | StringLiteral;
    // Other directive properties
  };
}

interface CodeFenceNodeType extends BaseNode {
  type: 'CodeFence';
  content: string;
  // Other code fence properties
}

interface CommentNodeType extends BaseNode {
  type: 'Comment';
  content: string;
}

// Combine into a union type
type MeldNode = TextNodeType | DirectiveNodeType | CodeFenceNodeType | CommentNodeType;

// Now we can use type narrowing instead of assertions
async resolve(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
  const resolvedParts: string[] = [];

  for (const node of nodes) {
    // Type narrowing works automatically
    if (node.type === 'Comment' || node.type === 'Directive') {
      continue;
    }

    // TypeScript knows node.type can only be 'Text' or 'CodeFence' here
    if (node.type === 'Text') {
      resolvedParts.push(node.content); // No type assertion needed
    } else if (node.type === 'CodeFence') {
      resolvedParts.push(node.content); // No type assertion needed
    }
  }

  return resolvedParts.filter(Boolean).join('');
}
```

### Benefits
1. **Type Safety**: Eliminates the need for unsafe type assertions
2. **Compiler Assistance**: TypeScript can verify all cases are handled
3. **Intellisense Support**: Better code completion and documentation
4. **Error Prevention**: Catches property access errors at compile time
5. **Readability**: Code clearly expresses intent without type assertions

## 3. Enhanced Resolution Context Type

### Current Issues
The current `ResolutionContext` appears to be a simple object without strict typing for configuration options and state:

```typescript
async resolve(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
  // Context properties are accessed without type checking
}
```

### Proposed Solution
```typescript
// Define a proper context interface with all possible options
export interface ResolutionContext {
  // Core properties
  strict: boolean;
  depth: number;
  
  // Formatting options
  formattingContext?: FormattingContext;
  
  // Variable resolution options
  allowedVariableTypes?: Array<'text' | 'data' | 'path'>;
  isVariableEmbed?: boolean;
  
  // Additional context
  parentPath?: string;
  currentFilePath?: string;
}

export interface FormattingContext {
  isBlock: boolean;
  nodeType?: string;
  linePosition?: 'start' | 'middle' | 'end';
  preserveStructure?: boolean;
}

// Then provide helper functions for creating contexts
export function createDefaultContext(overrides?: Partial<ResolutionContext>): ResolutionContext {
  return {
    strict: false,
    depth: 0,
    ...overrides
  };
}

export function createStrictContext(overrides?: Partial<ResolutionContext>): ResolutionContext {
  return {
    strict: true,
    depth: 0,
    ...overrides
  };
}

// Usage in ContentResolver
async resolve(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
  // Now context properties are type-checked
  const resolvedParts: string[] = [];
  
  // Can safely access typed properties
  const isStrict = context.strict;
  const formattingMode = context.formattingContext?.isBlock ? 'block' : 'inline';
  
  // Rest of the method...
}
```

### Benefits
1. **Explicit Configuration**: All possible context options are documented in the type
2. **Type Checking**: Prevents typos and accidental property access
3. **Default Values**: Helper functions ensure consistent contexts
4. **Documentation**: Types serve as self-documentation for the resolution process
5. **Extensibility**: Structured approach makes it easy to add new context options

## 4. Variable Type Representation and Type Guards

### Current Issues
The current code handles variable types through string checks and type assertions:

```typescript
// Accessing directive value
const directiveValue = (directiveNode as any).directive?.value;

// Checking value type
if (directiveValue && typeof directiveValue === 'object' && directiveValue.type === 'StringLiteral') {
  // ...
}
```

### Proposed Solution
```typescript
// Define variable types
export type VariableType = 'text' | 'data' | 'path';

// Define variable value types
export type TextVariableValue = string;
export type PathVariableValue = string;
export type DataVariableValue = object | string | number | boolean | null;

// Define variable container types
export interface Variable<T> {
  name: string;
  type: VariableType;
  value: T;
}

export interface TextVariable extends Variable<TextVariableValue> {
  type: 'text';
}

export interface DataVariable extends Variable<DataVariableValue> {
  type: 'data';
}

export interface PathVariable extends Variable<PathVariableValue> {
  type: 'path';
}

export type MeldVariable = TextVariable | DataVariable | PathVariable;

// Type guards for variable checking
export function isTextVariable(variable: any): variable is TextVariable {
  return variable && variable.type === 'text' && typeof variable.value === 'string';
}

export function isDataVariable(variable: any): variable is DataVariable {
  return variable && variable.type === 'data';
}

export function isPathVariable(variable: any): variable is PathVariable {
  return variable && variable.type === 'path' && typeof variable.value === 'string';
}

// Usage example
function processVariable(variable: MeldVariable): string {
  if (isTextVariable(variable)) {
    return variable.value; // TypeScript knows this is a string
  } else if (isDataVariable(variable)) {
    return JSON.stringify(variable.value); // TypeScript knows this could be complex
  } else if (isPathVariable(variable)) {
    return `Path: ${variable.value}`; // TypeScript knows this is a string
  }
  
  // TypeScript knows all cases are covered
  return '';
}
```

### Benefits
1. **Type Safety**: Clear type definitions for each variable type
2. **Exhaustiveness Checking**: TypeScript can verify all variable types are handled
3. **Self-Documenting**: Types clearly document the structure of variables
4. **Type Guards**: Safe type checking and narrowing without assertions
5. **Consistency**: Unified approach to variable handling across the codebase

## 5. AST Node Visitors Pattern

### Current Issues
The `ContentResolver.resolve()` method uses a switch statement to handle different node types:

```typescript
switch (node.type) {
  case 'Text':
    resolvedParts.push((node as TextNode).content);
    break;
  case 'CodeFence':
    resolvedParts.push((node as CodeFenceNode).content);
    break;
}
```

This approach is difficult to extend and requires type assertions.

### Proposed Solution
```typescript
// Define a visitor interface
export interface NodeVisitor<T> {
  visitText(node: TextNodeType): T;
  visitCodeFence(node: CodeFenceNodeType): T;
  visitDirective(node: DirectiveNodeType): T;
  visitComment(node: CommentNodeType): T;
}

// Implement a string-building visitor
export class ContentResolutionVisitor implements NodeVisitor<string> {
  constructor(private context: ResolutionContext) {}
  
  visitText(node: TextNodeType): string {
    return node.content;
  }
  
  visitCodeFence(node: CodeFenceNodeType): string {
    return node.content;
  }
  
  visitDirective(node: DirectiveNodeType): string {
    // Skip directives in content resolution
    return '';
  }
  
  visitComment(node: CommentNodeType): string {
    // Skip comments in content resolution
    return '';
  }
}

// Helper function to apply visitor
export function visitNode<T>(node: MeldNode, visitor: NodeVisitor<T>): T {
  switch (node.type) {
    case 'Text': return visitor.visitText(node);
    case 'CodeFence': return visitor.visitCodeFence(node);
    case 'Directive': return visitor.visitDirective(node);
    case 'Comment': return visitor.visitComment(node);
  }
}

// Updated ContentResolver
export class ContentResolver {
  constructor(private stateService: IStateService) {}
  
  async resolve(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
    const visitor = new ContentResolutionVisitor(context);
    const resolvedParts = nodes.map(node => visitNode(node, visitor));
    
    return resolvedParts.filter(Boolean).join('');
  }
}
```

### Benefits
1. **Extensibility**: Easy to add new node types
2. **Type Safety**: No type assertions needed
3. **Separation of Concerns**: Each node type handled in its own method
4. **Reusability**: Visitor pattern can be reused across the codebase
5. **Maintainability**: Makes changes to node handling logic more localized

## Conclusion

These type system improvements address the core challenges in the ContentResolution service:

1. **Complexity Reduction**: By replacing manual type checking with proper TypeScript types
2. **Safety Improvement**: By eliminating type assertions and adding proper type guards
3. **Maintainability Enhancement**: By making the code more self-documenting and consistent
4. **Error Prevention**: By catching potential issues at compile time rather than runtime
5. **Alignment with AST**: By creating types that match the structure of AST nodes

Implementing these changes will make the ContentResolution service more robust, easier to understand, and simpler to maintain as the Meld language continues to evolve.