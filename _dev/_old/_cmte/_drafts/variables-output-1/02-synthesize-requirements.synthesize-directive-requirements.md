# Consolidated TypeScript Type Features for Meld Variable Handling

## Overview

After analyzing the suggestions from various service leads, I've consolidated the most valuable TypeScript type improvements for Meld's variable handling system. These features will enhance code safety, maintainability, and developer experience across the codebase.

## Core Type Features

### 1. Variable Type Enumeration

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

**Justification:** Consistently requested across services. Replaces string literals with a centralized enum, improving type safety, enabling autocomplete, and preventing typos. Simplifies variable type checks and makes code more maintainable.

### 2. Discriminated Union for Variable Values

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
  value: any; // Could be refined to specific data types
}

/**
 * Represents a path variable value
 */
export interface PathVariableValue {
  type: VariableType.PATH;
  value: string;
  isAbsolute?: boolean;
}

/**
 * Represents a command variable value
 */
export interface CommandVariableValue {
  type: VariableType.COMMAND;
  value: string;
  args?: string[];
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

**Justification:** Requested by multiple services. Eliminates manual type checking and conversion, making variable handling more robust. The discriminated union pattern enables type narrowing and compile-time safety.

### 3. Strongly-Typed Resolution Context

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
  /** Maximum allowed resolution depth */
  maxDepth?: number;
  /** Whether to throw errors on missing variables (strict mode) */
  strict?: boolean;
  /** Allowed variable types for this resolution context */
  allowedVariableTypes?: VariableType[];
  /** Whether this is a variable embed operation */
  isVariableEmbed?: boolean;
  /** Whether to disable path prefixing */
  disablePathPrefixing?: boolean;
  /** Formatting context for output generation */
  formattingContext?: FormattingContext;
  /** Resolution chain for circular reference detection */
  resolutionChain?: string[];
}
```

**Justification:** Unanimously requested. Replaces `any` with a proper interface, providing self-documentation, consistency, and compile-time checking for resolution context properties.

### 4. Formatting Context Type

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

**Justification:** Requested by multiple services. Standardizes formatting context to ensure consistent variable rendering across directive boundaries.

### 5. Field Access Type System

```typescript
/**
 * Represents a field access segment
 */
export type FieldAccessSegment = 
  | { type: 'property'; name: string }
  | { type: 'index'; value: number };

/**
 * Represents a complete field access path
 */
export type FieldPath = FieldAccessSegment[];

/**
 * Result of a field access operation
 */
export type FieldAccessResult<T = any> = 
  | { success: true; value: T; path: string }
  | { success: false; error: string; path: string };
```

**Justification:** Requested by resolution services. Replaces string-based field access with structured types, improving type safety and error handling for data variable field access.

### 6. Variable Reference Node Type

```typescript
/**
 * Base interface for variable reference nodes
 */
export interface IVariableReference extends MeldNode {
  type: 'VariableReference';
  valueType: VariableType;
  identifier: string;
  fields?: FieldAccessSegment[];
  format?: FormattingContextType;
  resolvedValue?: any;
  isResolved?: boolean;
}
```

**Justification:** Requested by parser and resolution services. Provides a consistent type for variable reference nodes throughout the codebase, eliminating unsafe type assertions.

### 7. Operation Result Types

```typescript
/**
 * Generic result type for operations that may fail
 */
export type Result<T, E extends Error = Error> = 
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Result of variable resolution
 */
export interface ResolutionResult<T = any> {
  success: boolean;
  value?: T;
  originalType: VariableType;
  needsStringConversion: boolean;
  error?: string;
}

/**
 * Result of variable operations in state service
 */
export interface VariableOperationResult<T = void> {
  success: boolean;
  value?: T;
  error?: string;
  metadata?: {
    operation: 'get' | 'set' | 'delete';
    variableType: VariableType;
    name: string;
    timestamp: number;
  };
}
```

**Justification:** Requested by multiple services. Standardizes error handling and operation results, making the code more robust and easier to maintain.

## Directive Handler Integration

```typescript
/**
 * Context passed to directive handlers
 */
export interface DirectiveHandlerContext {
  /** Current state for the directive */
  state: StateServiceLike;
  /** Parent state for inheritance and variable resolution */
  parentState: StateServiceLike;
  /** Current file path for error reporting and path resolution */
  currentFilePath?: string;
  /** Formatting context for consistent output generation */
  formattingContext: FormattingContext;
  /** Resolution context for variable resolution */
  resolutionContext?: ResolutionContext;
}

/**
 * Result of directive handler execution
 */
export interface DirectiveHandlerResult {
  state: StateServiceLike;
  replacement?: MeldNode;
  getFormattingContext?(): FormattingContext;
}
```

**Justification:** Requested by interpreter service. Provides type safety for directive handler context and results, eliminating unsafe type casting.

## Key Decisions and Trade-offs

1. **Opted for Enum over String Literal Union Types**
   - Justification: Enums provide better IDE support, centralized definition, and are more maintainable when adding new variable types.

2. **Kept `any` for Data Variable Values**
   - Justification: While full typing would be ideal, the dynamic nature of JSON data makes it impractical to fully type at this stage.
   - Future enhancement: Consider adding optional schema validation or