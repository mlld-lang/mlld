# Improving Variable Handling Types in DirectiveService

After analyzing the DirectiveService code and the Meld variable handling system, I've identified several areas where stronger TypeScript types would significantly improve code clarity, safety, and maintainability. The current implementation relies heavily on loose typing (`any`, string literals) and manual type checking, which introduces complexity and potential bugs.

## 1. Strongly-Typed Resolution Context

### Current Issue
The `resolutionContext` in `DirectiveContext` is currently typed as `any`, making it difficult to understand what properties are expected and which are optional:

```typescript
/** Resolution context for variable resolution */
resolutionContext?: any;
```

This leads to inconsistent usage throughout the code, with different properties being passed in different places. For example, in `resolveText()`:

```typescript
return this.resolutionClient.resolveText(text, context.resolutionContext || {
  currentFilePath: context.currentFilePath,
  workingDirectory: context.workingDirectory
});
```

### Proposed Solution
Create a dedicated interface for resolution contexts:

```typescript
/**
 * Represents the context needed for variable resolution
 */
export interface ResolutionContext {
  /** Current file being processed */
  currentFilePath?: string;
  /** Working directory for path resolution */
  workingDirectory?: string;
  /** Current state for variable lookup */
  state?: StateServiceLike;
  /** Maximum depth for nested resolution (prevents circular references) */
  depth?: number;
  /** Whether to throw errors on missing variables (strict mode) */
  strict?: boolean;
  /** Allowed variable types for this resolution context */
  allowedVariableTypes?: Array<'text' | 'data' | 'path'>;
  /** Whether this is a variable embed operation */
  isVariableEmbed?: boolean;
}
```

### Benefits
1. **Self-documenting code** - The interface clearly shows what properties are expected
2. **Consistency** - Ensures the same context structure is used throughout the codebase
3. **Type safety** - TypeScript will catch missing or incorrect properties
4. **Better IDE support** - Autocomplete will show available properties
5. **Easier refactoring** - Changes to the context structure are reflected everywhere

## 2. Enum-Based Variable Types

### Current Issue
Variable types are represented as string literals throughout the code:

```typescript
await this.stateService!.setTextVar(directive.identifier, directive.value);
await this.stateService!.setDataVar(directive.identifier, value);
```

This leads to inconsistency, typos, and difficulty understanding which variable types are supported.

### Proposed Solution
Create an enum for variable types:

```typescript
/**
 * Represents the different types of variables in Meld
 */
export enum VariableType {
  /** Text variables ({{var}}) */
  TEXT = 'text',
  /** Data variables ({{var.field}}) */
  DATA = 'data',
  /** Path variables ($var) */
  PATH = 'path',
  /** Command variables (@command) */
  COMMAND = 'command'
}
```

Update StateService methods to use the enum:

```typescript
// In StateServiceLike interface
setVariable(type: VariableType, name: string, value: any): Promise<void>;
getVariable(type: VariableType, name: string): Promise<any>;

// Usage in DirectiveService
await this.stateService!.setVariable(VariableType.TEXT, directive.identifier, directive.value);
```

### Benefits
1. **Type safety** - TypeScript will catch invalid variable types
2. **Centralized definition** - Variable types are defined in one place
3. **IDE support** - Autocomplete will show available variable types
4. **Easier extension** - Adding new variable types is simpler and safer
5. **Consistency** - The same enum is used throughout the codebase

## 3. Strongly-Typed Variable Values

### Current Issue
Variable values are loosely typed as `any`, requiring manual type checking and conversion:

```typescript
// Value is already interpolated by meld-ast
let value = directive.value;
if (typeof value === 'string') {
  value = JSON.parse(value);
}

await this.stateService!.setDataVar(directive.identifier, value);
```

This pattern appears in multiple places, increasing code complexity and the risk of runtime errors.

### Proposed Solution
Create a discriminated union type for variable values:

```typescript
/**
 * Represents a text variable value
 */
export interface TextVariableValue {
  type: VariableType.TEXT;
  value: string;
}

/**
 * Represents a data variable value
 */
export interface DataVariableValue {
  type: VariableType.DATA;
  value: any; // Could be further refined to Record<string, any> | any[] | primitive
}

/**
 * Represents a path variable value
 */
export interface PathVariableValue {
  type: VariableType.PATH;
  value: string;
}

/**
 * Represents a command variable value
 */
export interface CommandVariableValue {
  type: VariableType.COMMAND;
  value: string;
}

/**
 * Union type for all variable values
 */
export type VariableValue = 
  | TextVariableValue 
  | DataVariableValue 
  | PathVariableValue 
  | CommandVariableValue;
```

Update StateService methods to use the typed values:

```typescript
// In StateServiceLike interface
setVariable(name: string, value: VariableValue): Promise<void>;
getVariable(type: VariableType, name: string): Promise<VariableValue | undefined>;

// Usage in DirectiveService
await this.stateService!.setVariable(directive.identifier, {
  type: VariableType.DATA,
  value: typeof directive.value === 'string' ? JSON.parse(directive.value) : directive.value
});
```

### Benefits
1. **Type safety** - The type system ensures values match their variable type
2. **Self-validation** - The type structure enforces correct data shapes
3. **Simplified logic** - Reduces manual type checking and conversions
4. **Better debugging** - Type information is preserved during runtime
5. **Documentation** - Types clearly show what values are expected

## 4. Typed Formatting Context

### Current Issue
The `formattingContext` in `DirectiveContext` uses string literals and optional properties:

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

This makes it difficult to ensure consistent formatting across directive boundaries.

### Proposed Solution
Create dedicated types for formatting contexts:

```typescript
/**
 * Represents the context type for formatting
 */
export enum FormattingContextType {
  INLINE = 'inline',
  BLOCK = 'block'
}

/**
 * Represents the formatting context for output generation
 */
export interface FormattingContext {
  /** Whether in output-literal mode (formerly transformation mode) */
  isOutputLiteral: boolean;
  /** Whether this is an inline or block context */
  contextType: FormattingContextType;
  /** Current node type being processed */
  nodeType: string;
  /** Whether at start of line */
  atLineStart?: boolean;
  /** Whether at end of line */
  atLineEnd?: boolean;
  /** Parent formatting context for inheritance */
  parentContext?: FormattingContext;
}
```

Update DirectiveContext to use the new type:

```typescript
export interface DirectiveContext extends DirectiveContextBase {
  // Other properties...
  /** Formatting context for output generation */
  formattingContext?: FormattingContext;
}
```

### Benefits
1. **Type safety** - Ensures consistent formatting context structure
2. **Self-documenting** - Clear definition of what properties are available
3. **Consistency** - The same structure is used throughout the