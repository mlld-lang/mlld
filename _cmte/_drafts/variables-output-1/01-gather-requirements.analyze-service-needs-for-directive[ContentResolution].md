# ContentResolution Service: Type System Improvements

After analyzing the current ContentResolver and StringLiteralHandler implementations, I've identified several opportunities to strengthen the type system for variable handling. These improvements will make the code more maintainable, reduce runtime errors, and provide better developer experience.

## 1. Discriminated Union Types for MeldNode Processing

### Current Implementation Issues
The ContentResolver currently uses type casting with `as` and relies on string-based type checking:

```typescript
if (node.type === 'Comment' || node.type === 'Directive') {
  continue;
}

switch (node.type) {
  case 'Text':
    resolvedParts.push((node as TextNode).content);
    break;
  case 'CodeFence':
    resolvedParts.push((node as CodeFenceNode).content);
    break;
}
```

This approach is error-prone because:
- Type safety relies on string comparison
- Requires manual type casting
- Switch statement doesn't ensure exhaustive handling of node types
- TypeScript can't verify that `.content` exists on the casted types

### Proposed Solution: Discriminated Union Types

```typescript
// Define a proper discriminated union
type MeldNode = 
  | { type: 'Text'; content: string } 
  | { type: 'CodeFence'; content: string }
  | { type: 'Comment'; content: string }
  | { type: 'Directive'; directive: DirectiveNode };

// Then the resolution code becomes type-safe:
async resolve(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
  const resolvedParts: string[] = [];

  for (const node of nodes) {
    // TypeScript now understands this condition fully
    if (node.type === 'Comment' || node.type === 'Directive') {
      continue;
    }

    // No type casting needed - TypeScript knows node is Text or CodeFence
    resolvedParts.push(node.content);
  }

  return resolvedParts
    .filter(Boolean)
    .join('');
}
```

### Benefits
1. **Compile-time safety**: TypeScript enforces correct property access
2. **No type casting**: Eliminates error-prone `as` casts
3. **Self-documenting**: Types make clear what properties each node has
4. **Exhaustiveness checking**: TypeScript can verify all cases are handled

## 2. Strongly Typed Quote Handling

### Current Implementation Issues
The StringLiteralHandler uses a constant array with type assertion for quote types:

```typescript
private readonly QUOTE_TYPES = ["'", '"', '`'] as const;
// Later used with unsafe casting:
quoteType as typeof this.QUOTE_TYPES[number]
```

This approach:
- Doesn't provide strong guarantees about quote types
- Requires manual type assertions
- Doesn't benefit from IDE autocomplete
- Makes it harder to ensure consistent handling across the codebase

### Proposed Solution: String Literal Union Type

```typescript
// Define a proper string literal union type
type QuoteType = "'" | '"' | '`';

// Use the type in the class
export class StringLiteralHandler {
  private readonly QUOTE_TYPES: QuoteType[] = ["'", '"', '`'];
  
  // Methods can now use proper typing
  private unescapeQuotes(content: string, quoteType: QuoteType): string {
    // No casting needed, type is guaranteed
    return content.replace(new RegExp(`\\\\${quoteType}`, 'g'), quoteType);
  }
}
```

### Benefits
1. **Type safety**: Guarantees only valid quote types are used
2. **Self-documenting**: Makes the expected values explicit
3. **IDE support**: Enables autocomplete for valid quote types
4. **Consistency**: Ensures consistent handling throughout the codebase

## 3. Structured AST Node Types

### Current Implementation Issues
The StringLiteralHandler uses unsafe type access with `(node as any).directive?.kind`:

```typescript
const directiveNode = nodes.find(node => 
  node.type === 'Directive' && 
  (node as any).directive?.kind === 'text'
);

const directiveValue = (directiveNode as any).directive?.value;
```

This approach:
- Uses `any` which bypasses all type checking
- Makes assumptions about the structure of directive nodes
- Doesn't document the expected structure
- Is prone to runtime errors if the structure changes

### Proposed Solution: Detailed Type Hierarchy

```typescript
// Define proper interfaces for directive nodes
interface DirectiveNode {
  type: 'Directive';
  directive: {
    kind: DirectiveKind;
    value: DirectiveValue;
  };
}

type DirectiveKind = 'text' | 'data' | 'path' | 'import' | 'embed' | 'run';

type DirectiveValue = 
  | string 
  | { type: 'StringLiteral'; value: string }
  | { type: 'ObjectLiteral'; value: Record<string, any> }
  | { type: 'ArrayLiteral'; value: any[] };

// Then the code becomes much safer:
const directiveNode = nodes.find(node => 
  node.type === 'Directive' && 
  node.directive.kind === 'text'
) as DirectiveNode | undefined;

if (directiveNode) {
  const directiveValue = directiveNode.directive.value;
  
  if (typeof directiveValue === 'object' && 
      directiveValue.type === 'StringLiteral') {
    return directiveValue.value;
  }
}
```

### Benefits
1. **Type safety**: Enforces correct structure access
2. **Self-documenting**: Types document the expected structure
3. **Refactoring support**: Changes to the structure are caught at compile time
4. **Maintainability**: Makes code more resilient to structure changes

## 4. Improved Resolution Context Type

### Current Implementation Issues
The ResolutionContext type is imported but not fully utilized:

```typescript
async resolve(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
  // context is not used effectively
}
```

The context object likely contains important information about how to handle variables, but it's not being leveraged effectively.

### Proposed Solution: Enhanced Context Type

```typescript
interface ResolutionContext {
  // Existing fields
  strict: boolean;
  depth: number;
  
  // New fields for better variable handling
  variableFormat: 'inline' | 'block';
  outputMode: 'literal' | 'normalized';
  allowedVariableTypes: Array<'text' | 'data' | 'path'>;
  formattingOptions: {
    indentLevel: number;
    preserveWhitespace: boolean;
    compactObjects: boolean;
  };
}

// Then use it effectively in the resolve method:
async resolve(nodes: MeldNode[], context: ResolutionContext): Promise<string> {
  const resolvedParts: string[] = [];
  
  // Use context to determine formatting
  const formatting = context.formattingOptions;
  const indent = ' '.repeat(formatting.indentLevel * 2);
  
  for (const node of nodes) {
    // Process based on context settings
    if (node.type === 'Text') {
      // Format text differently based on context
      const formattedContent = context.outputMode === 'literal' 
        ? node.content 
        : this.normalizeWhitespace(node.content);
        
      resolvedParts.push(formattedContent);
    }
  }
  
  // Join with appropriate whitespace based on context
  return context.outputMode === 'literal'
    ? resolvedParts.join('')
    : resolvedParts.join(' ');
}
```

### Benefits
1. **Consistent formatting**: Ensures consistent handling of variables
2. **Configuration**: Makes resolution behavior configurable
3. **Self-documenting**: Types document available options
4. **Extensibility**: Easy to add new resolution behaviors

## 5. Parser Service Result Type

### Current Implementation Issues
The StringLiteralHandler makes assumptions about the ParserService's return type:

```typescript
const nodes =