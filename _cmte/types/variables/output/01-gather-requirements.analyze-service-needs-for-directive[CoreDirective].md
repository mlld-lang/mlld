# Variable Handling Type Improvements for CoreDirective Service

After analyzing the DirectiveService code and the Meld variable handling system, I've identified several opportunities to improve type safety, reduce complexity, and enhance maintainability through stronger TypeScript typing. Here are my recommended improvements with clear justifications for each.

## 1. Strongly Typed Resolution Context

### Current Issues:
```typescript
/** Resolution context for variable resolution */
resolutionContext?: any;
```

The `resolutionContext` is currently typed as `any`, which:
- Makes it unclear what properties are expected or allowed
- Provides no type checking when passing it between services
- Requires manual property checking in implementation code

### Proposed Solution:
```typescript
/** 
 * Strongly typed resolution context for variable resolution 
 */
interface ResolutionContext {
  /** Current file being processed */
  currentFilePath?: string;
  /** Working directory for resolving paths */
  workingDirectory?: string;
  /** Maximum depth for nested resolution to prevent infinite recursion */
  depth?: number;
  /** Whether to throw on missing variables or return empty string */
  strict?: boolean;
  /** State for variable lookup */
  state?: StateServiceLike;
  /** Allowed variable types for this resolution context */
  allowedVariableTypes?: Array<'text' | 'data' | 'path'>;
  /** Whether this is a variable embed (affects path prefixing) */
  isVariableEmbed?: boolean;
}
```

### Benefits:
1. **Self-documenting API**: Clear documentation of what the resolution context can contain
2. **Compile-time validation**: Prevents passing invalid properties to resolution methods
3. **IDE support**: Provides autocomplete for available properties
4. **Consistency**: Ensures the same context structure is used across all resolution calls

## 2. Typed Variable Value Storage

### Current Issues:
When handling directives like `@text` and `@data`, the code has to manually check types and handle conversions:

```typescript
// Value is already interpolated by meld-ast
let value = directive.value;
if (typeof value === 'string') {
  value = JSON.parse(value);
}
await this.stateService!.setDataVar(directive.identifier, value);
```

This pattern appears multiple times with subtle variations, creating potential for inconsistencies.

### Proposed Solution:
```typescript
/** Strongly typed variable values */
interface VariableTypes {
  /** Text variable value - always a string */
  text: string;
  /** Data variable value - can be any JSON-compatible value */
  data: JsonValue;
  /** Path variable value - always a string representing a path */
  path: string;
}

type JsonValue = 
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

/** Type-safe setter methods */
interface StateServiceWithTypedVars extends StateServiceLike {
  setTextVar(name: string, value: VariableTypes['text']): Promise<void>;
  setDataVar(name: string, value: VariableTypes['data']): Promise<void>;
  setPathVar(name: string, value: VariableTypes['path']): Promise<void>;
  
  getTextVar(name: string): Promise<VariableTypes['text'] | undefined>;
  getDataVar(name: string): Promise<VariableTypes['data'] | undefined>;
  getPathVar(name: string): Promise<VariableTypes['path'] | undefined>;
}
```

### Benefits:
1. **Type safety**: Prevents accidentally passing the wrong type of value
2. **Reduced manual type checking**: No need for manual `typeof` checks
3. **Consistency**: Ensures consistent handling of variable types across the codebase
4. **Better error messages**: TypeScript will provide clear error messages when types don't match

## 3. Formatting Context Type Improvements

### Current Issues:
The current `formattingContext` type in DirectiveContext is loose:

```typescript
formattingContext?: {
  /** Whether in output-literal mode (formerly transformation mode) */
  isOutputLiteral: boolean;
  /** Whether this is an inline or block context */
  contextType: 'inline' | 'block';
  /** Current node type being processed */
  nodeType: string;
  /** Whether at start of line */
  atLineStart?: boolean;
  /** Whether at end of line */
  atLineEnd?: boolean;
  /** Parent formatting context for inheritance */
  parentContext?: any;
};
```

The issues include:
- `nodeType` is a string with no validation
- `parentContext` is typed as `any`
- No clear distinction between required and optional properties
- Missing validation for related properties

### Proposed Solution:
```typescript
/** Node types for formatting context */
type NodeType = 'Text' | 'Directive' | 'CodeFence' | 'Comment';

/** Format context type for consistent output generation */
interface FormattingContext {
  /** Whether in output-literal mode */
  isOutputLiteral: boolean;
  /** Whether this is an inline or block context */
  contextType: 'inline' | 'block';
  /** Current node type being processed */
  nodeType: NodeType;
  /** Line position information */
  linePosition?: {
    /** Whether at start of line */
    atLineStart: boolean;
    /** Whether at end of line */
    atLineEnd: boolean;
  };
  /** Parent formatting context for inheritance */
  parentContext?: FormattingContext;
}
```

### Benefits:
1. **Explicit node types**: Prevents typos and ensures only valid node types are used
2. **Self-referential typing**: Parent context has the same type as the current context
3. **Grouped related properties**: Line position properties are grouped logically
4. **Clear distinction**: Required vs optional properties are clearly indicated

## 4. Directive Result Type Enhancement

### Current Issues:
The `DirectiveResult` interface has loose typing for its `formattingContext`:

```typescript
formattingContext?: {
  isOutputLiteral?: boolean;
  contextType?: 'inline' | 'block';
  nodeType?: string;
  [key: string]: any;
};
```

This allows arbitrary properties and doesn't enforce consistency with the `DirectiveContext.formattingContext`.

### Proposed Solution:
```typescript
/** Result of executing a directive */
interface DirectiveResult {
  /** Updated state after processing */
  state: StateServiceLike;
  
  /** Replacement node in transformation mode */
  replacement?: MeldNode;
  
  /** Formatting context for output generation */
  formattingContext?: Partial<FormattingContext>;
}
```

### Benefits:
1. **Consistency**: Uses the same `FormattingContext` type defined earlier
2. **Partial type**: Allows specifying only the properties that need to change
3. **No index signature**: Prevents adding arbitrary properties that aren't part of the defined context
4. **Type safety**: Ensures only valid properties with correct types can be set

## 5. Variable Reference Resolution Types

### Current Issues:
The current resolution methods don't provide strong typing for field access paths:

```typescript
private async resolveData(ref: string, context: DirectiveContext): Promise<any> {
  // Implementation with minimal type safety
}
```

This leads to:
- Return type of `any` which propagates type unsafety
- No validation of field access paths at compile time
- No clear indication of what fields are available

### Proposed Solution:
```typescript
/** Field access path for structured data */
type FieldPath = Array<string | number>;

/** Variable reference with optional field path */
interface VariableReference {
  /** Variable name without field path */
  name: string;
  /** Optional field path for structured data */
  fields?: FieldPath;
}

/** Enhanced resolution methods */
interface ResolutionServiceWithTypedRefs extends ResolutionServiceLike {
  /** Resolve a variable reference with field access */
  resolveReference(ref: VariableReference, context: ResolutionContext): Promise<JsonValue>;
  
  /** Parse a variable reference string into a structured reference */
  parseReference(refString: string): VariableReference;
}
```

### Benefits:
1. **Structured references**: Clear separation between variable name and field path
2. **Type safety**: Field paths are properly typed as strings or numbers
3. **Explicit parsing**: Separates parsing from resolution for better testability
4. **Consistent handling**: Ensures field paths are handled consistently

## 6. Directive Context Type Improvements

### Current Issues:
The `DirectiveContext` interface extends a base context but adds several properties with mixed typing:

```typescript
export interface DirectiveContext extends DirectiveContextBase {
  /** Parent state for nested contexts */
  parentState?: StateServiceLike;
  /** Current state for this directive */
  state: StateServiceLike;
  // ...other properties
}
```

This creates several issues:
- Unclear which properties are required vs optional
- No validation that parent/child states are compatible
- No type enforcement for resolution and formatting contexts

### Proposed Solution:
```typescript
/** Base context for all directive operations */
interface DirectiveContextBase {
  /** Current file being processed */
  currentFilePath: string;
  /** Working directory for command execution */
  workingDirectory: string;
}

/** Context for directive execution */
interface DirectiveContext extends DirectiveContextBase {
  /** Current state for this directive */
  state: StateServiceLike;
  
  /** Optional parent state for nested contexts */
  parentState?: StateServiceLike;
  
  /** Context for variable resolution */
  resolutionContext: ResolutionContext;
  
  /** Context for output formatting */
  formattingContext: FormattingContext;
}
```

### Benefits:
1. **Clear requirements**: Makes it obvious which properties are required
2. **Consistent typing**: Uses the strong types defined earlier
3. **Explicit structure**: Clearly defines the structure of the context
4. **IDE support**: Provides better autocomplete and documentation

## Overall Benefits of These Improvements

1. **Reduced Cognitive Load**: Developers can focus on business logic rather than manual type checking
2. **Fewer Runtime Errors**: More issues caught at compile time means fewer runtime surprises
3. **Self-Documenting Code**: Types serve as documentation that stays in sync with the code
4. **Better Refactoring Support**: IDE tools can reliably find all usages when refactoring
5. **Improved Maintainability**: New developers can more easily understand the codebase
6. **Consistent Implementations**: Standardized types encourage consistent implementations

## Implementation Strategy

These improvements can be implemented incrementally:

1. First, define the new type interfaces in a central location
2. Update the core interfaces (DirectiveContext, DirectiveResult, etc.)
3. Gradually update service implementations to use the new types
4. Add migration helpers where needed for backward compatibility
5. Update tests to leverage the stronger typing

This approach allows for gradual adoption without breaking existing code while still providing immediate benefits in the areas where the new types are used.