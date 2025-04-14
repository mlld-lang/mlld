# Improving Variable Handling Types in ContentResolution Service

## Current Variable Handling Challenges

After analyzing the ContentResolution service within the Meld codebase, I've identified several areas where the TypeScript type system could be strengthened to improve variable handling. The ContentResolution service is responsible for resolving variable references, handling field access, and converting variable values to appropriate string representations based on context.

## Proposed Type Improvements

### 1. Discriminated Union for Variable Types

**Current Issue:**
The service currently has to manually check variable types and perform type casting between text variables and data variables, which leads to complex conditional logic and potential runtime errors.

```typescript
// Current approach with manual type checking
const value = state.getTextVar(name) || state.getDataVar(name);
if (value === undefined) {
  if (context.strict) {
    throw new ResolutionError(`Variable '${name}' not found`);
  }
  return '';
}

// Type casting and manual checking for field access
if (fields.length > 0 && typeof value === 'object' && value !== null) {
  return this.resolveFieldAccess(value, fields, context);
}
```

**Proposed Solution:**
Implement a discriminated union type for variables that clearly distinguishes between variable types:

```typescript
// Define a discriminated union type
type MeldVariable = 
  | { type: 'text'; value: string }
  | { type: 'data'; value: any; structure: 'object' | 'array' | 'primitive' }
  | { type: 'path'; value: string; resolved: string };

// State service would return this type
interface IStateService {
  getVariable(name: string): MeldVariable | undefined;
  // Other methods...
}
```

**Benefits:**
1. **Type Safety**: The compiler can enforce proper handling of each variable type.
2. **Elimination of Manual Type Checks**: Replace manual type checking with TypeScript's pattern matching.
3. **Self-Documenting Code**: The type structure clearly communicates the variable's capabilities.
4. **Reduced Runtime Errors**: Fewer type casting errors and "undefined is not an object" errors.

### 2. Context-Aware Resolution Types

**Current Issue:**
The `ResolutionContext` is currently loosely typed, with optional fields that may or may not be present in different resolution scenarios. This leads to defensive coding patterns and unclear context propagation.

```typescript
// Current approach with loosely typed context
interface ResolutionContext {
  strict?: boolean;
  depth?: number;
  allowedVariableTypes?: string[];
  isVariableEmbed?: boolean;
  // Other context properties...
}

// Usage with defensive checks
if (context.strict) {
  // Handle strict mode
}
```

**Proposed Solution:**
Create specific, purpose-built context types for different resolution scenarios:

```typescript
// Base context with required properties
interface BaseResolutionContext {
  strict: boolean;
  depth: number;
}

// Extended contexts for specific scenarios
interface VariableEmbedContext extends BaseResolutionContext {
  isVariableEmbed: true;
  allowPathPrefixing: false;
}

interface DirectiveResolutionContext extends BaseResolutionContext {
  allowedVariableTypes: string[];
  directiveKind: DirectiveKind;
}

// Union type for all contexts
type ResolutionContext = 
  | BaseResolutionContext 
  | VariableEmbedContext 
  | DirectiveResolutionContext;

// Context factory functions
function createStandardContext(strict = true): BaseResolutionContext {
  return { strict, depth: 0 };
}

function createVariableEmbedContext(): VariableEmbedContext {
  return { strict: true, depth: 0, isVariableEmbed: true, allowPathPrefixing: false };
}
```

**Benefits:**
1. **Context Clarity**: Each resolution scenario has a clearly defined context type.
2. **Required Properties**: No more undefined checks for critical context properties.
3. **Factory Functions**: Standardized context creation eliminates inconsistencies.
4. **Better IntelliSense**: Developers get appropriate property suggestions based on context type.

### 3. Formatting Context Enum

**Current Issue:**
The formatting context for variable conversion is currently determined by multiple boolean flags, making it difficult to understand the expected formatting behavior and ensure consistency.

```typescript
// Current approach with multiple boolean flags
convertToString(value: any, isBlock?: boolean, isTransformation?: boolean): string {
  if (isBlock) {
    // Block formatting
  } else {
    // Inline formatting
  }
  // Additional logic based on isTransformation...
}
```

**Proposed Solution:**
Replace boolean flags with a clear formatting context enum:

```typescript
// Define formatting modes as an enum
enum FormattingMode {
  INLINE_COMPACT = 'inline_compact',
  INLINE_EXPANDED = 'inline_expanded',
  BLOCK_PRETTY = 'block_pretty',
  BLOCK_LITERAL = 'block_literal'
}

// Use the enum in the convertToString method
convertToString(value: any, formattingMode: FormattingMode): string {
  switch (formattingMode) {
    case FormattingMode.INLINE_COMPACT:
      return this.formatCompact(value);
    case FormattingMode.BLOCK_PRETTY:
      return this.formatPretty(value);
    // Handle other formatting modes...
  }
}
```

**Benefits:**
1. **Clear Intent**: The enum values clearly communicate the intended formatting.
2. **Extensibility**: New formatting modes can be added without changing the method signature.
3. **Consistency**: Standardized formatting modes ensure consistent output across the codebase.
4. **Self-Documentation**: The enum values serve as documentation for the available formatting options.

### 4. Field Access Path Type

**Current Issue:**
Field access paths (e.g., `user.profile.name` or `items.0.title`) are currently handled as string arrays, requiring manual parsing and type checking during traversal.

```typescript
// Current approach with string arrays for fields
resolveFieldAccess(obj: any, fields: string[], context: ResolutionContext): any {
  let current = obj;
  for (const field of fields) {
    if (current === null || current === undefined) {
      // Handle error...
    }
    current = current[field];
  }
  return current;
}
```

**Proposed Solution:**
Create a structured field access path type that supports validation and traversal:

```typescript
// Define field access types
type ObjectField = { type: 'object'; name: string };
type ArrayIndex = { type: 'array'; index: number };
type FieldAccessSegment = ObjectField | ArrayIndex;

// Parse and validate field paths
function parseFieldPath(path: string): FieldAccessSegment[] {
  return path.split('.').map(segment => {
    const numIndex = parseInt(segment, 10);
    if (!isNaN(numIndex) && numIndex.toString() === segment) {
      return { type: 'array', index: numIndex };
    }
    return { type: 'object', name: segment };
  });
}

// Type-safe field access
function accessField(data: any, path: FieldAccessSegment[]): any {
  return path.reduce((current, segment) => {
    if (current === null || current === undefined) {
      throw new ResolutionError('Cannot access field on null or undefined');
    }
    
    if (segment.type === 'array') {
      if (!Array.isArray(current)) {
        throw new ResolutionError(`Expected array, got ${typeof current}`);
      }
      if (segment.index < 0 || segment.index >= current.length) {
        throw new ResolutionError(`Array index ${segment.index} out of bounds`);
      }
      return current[segment.index];
    } else {
      if (typeof current !== 'object') {
        throw new ResolutionError(`Expected object, got ${typeof current}`);
      }
      return current[segment.name];
    }
  }, data);
}
```

**Benefits:**
1. **Type-Safe Traversal**: Clear distinction between object field access and array index access.
2. **Better Error Messages**: Specific error messages for different access failures.
3. **Validation at Parse Time**: Field paths can be validated when parsed, not just during traversal.
4. **Reusable Logic**: The field access logic can be reused across different parts of the codebase.

### 5. Variable Reference Parser Types

**Current Issue:**
The variable reference parser (`parseContent`) currently returns a loosely typed array of nodes, requiring manual type checking when processing the parsed content.

```typescript
// Current approach with loosely typed nodes
parseContent(content: string): Array<TextNode | VariableReferenceNode> {
  // Parse content...
}

// Usage with manual type checking
const nodes = this.parseContent(content);
for (const node of nodes) {
  if (node.type === 'text') {
    // Handle text node
  } else if (node.type === 'variable') {
    // Handle variable node
  }
}
```

**Proposed Solution:**
Create a strongly typed parser result with discriminated union types:

```typescript
// Define strongly typed nodes
interface BaseNode {
  type: string;
  content: string;
}

interface TextNode extends BaseNode {
  type: 'text';
}

interface VariableReferenceNode extends BaseNode {
  type: 'variable';
  name: string;
  fields: string[];
  originalReference: string;
}

type ParsedNode = TextNode | VariableReferenceNode;

// Parser function with strongly typed return
function parseContent(content: string): ParsedNode[] {
  // Parse content...
}

// Type-safe node visitor pattern
interface NodeVisitor {
  visitTextNode(node: TextNode): string;
  visitVariableNode(node: VariableReferenceNode, context: ResolutionContext): string;
}

function processNodes(nodes: ParsedNode[], visitor: NodeVisitor, context: ResolutionContext): string {
  return nodes.map(node => {
    switch (node.type) {
      case 'text':
        return visitor.visitTextNode(node);
      case 'variable':
        return visitor.visitVariableNode(node, context);
      default:
        // TypeScript will catch if we miss a node type
        const _exhaustiveCheck: never = node;
        return '';
    }
  }).join('');
}
```

**Benefits:**
1. **Exhaustiveness Checking**: TypeScript can verify that all node types are handled.
2. **Visitor Pattern**: Clean separation of node processing logic.
3. **Self-Documenting**: Node types clearly document their structure and purpose.
4. **Reduced Boilerplate**: Eliminates repetitive type checking code.

## Implementation Strategy

To implement these improvements, I recommend the following approach:

1. **Start with the Variable Type Union**: This provides the foundation for other improvements.
2. **Implement Context Types**: Refactor the resolution context to use the new, more specific types.
3. **Add Formatting Mode Enum**: Replace boolean flags with the enum for clearer formatting intent.
4. **Enhance Field Access**: Implement the structured field access path type.
5. **Improve Parser Types**: Update the variable reference parser to use strongly typed nodes.

## Conclusion

These type improvements will significantly enhance the ContentResolution service by:

1. **Reducing Runtime Errors**: Stronger types catch more issues at compile time.
2. **Improving Code Clarity**: Types clearly communicate intent and constraints.
3. **Enhancing Maintainability**: Less defensive coding and manual type checking.
4. **Supporting Self-Documentation**: Types serve as living documentation for variable handling.
5. **Enabling Better Tooling**: IDEs can provide better suggestions and error messages.

By implementing these type improvements, we can make the ContentResolution service more robust, easier to maintain, and less prone to subtle bugs related to variable handling.