# Variable Handling Type System Improvements for Meld

After reviewing the VariableHandler service code, I've identified several areas where TypeScript's type system can be leveraged to create a more robust, maintainable, and self-documenting variable resolution system. The following improvements will significantly reduce runtime errors, improve code clarity, and make future maintenance easier.

## 1. Strongly Typed Variable Values

### Current Issues:
- Variables are stored and retrieved as `any` type, leading to unpredictable runtime behaviors
- Type checking is performed manually through conditionals (`typeof`, `Array.isArray()`)
- Field access relies on runtime checks that could be caught at compile time
- String conversion logic varies based on runtime type detection

### Proposed Solution:
```typescript
// Define a union type for all possible variable value types
type VariableValue = 
  | string 
  | number 
  | boolean 
  | null 
  | VariableObject 
  | VariableArray;

// For structured data
interface VariableObject {
  [key: string]: VariableValue;
}

// For array data
type VariableArray = VariableValue[];

// For variable storage in state
interface VariableStore<T extends VariableValue = VariableValue> {
  get(name: string): T | undefined;
  set(name: string, value: T): void;
  has(name: string): boolean;
}

// Type-specific stores
interface TextVariableStore extends VariableStore<string> {}
interface DataVariableStore extends VariableStore<VariableValue> {}
interface PathVariableStore extends VariableStore<string> {}
```

### Benefits:
1. **Type Safety**: Prevents improper usage of variable values by enforcing type constraints
2. **Self-Documentation**: Makes the expected variable types explicit in the code
3. **Simplified Logic**: Eliminates need for extensive type checking and error-prone type coercion
4. **Better Error Messages**: TypeScript will provide clear compile-time errors when variable types are misused

## 2. Field Access Type System

### Current Issues:
- Field access uses untyped arrays and manual type checking
- Field access errors are only caught at runtime
- Complex error handling for various field access scenarios
- Duplicate code for field validation and access

### Proposed Solution:
```typescript
// Type-safe field access path
type FieldPath = Array<Field>;

// Strong typing for field access operations
interface Field {
  type: 'field' | 'index';
  value: string | number;
}

// Type-safe field accessor
class TypedFieldAccessor {
  static access<T extends VariableValue>(
    value: T, 
    fields: FieldPath
  ): VariableValue | undefined {
    // Implementation with proper type narrowing
  }
  
  // Type predicates for field access validation
  static canAccessField(value: VariableValue, field: Field): boolean {
    if (field.type === 'index') {
      return Array.isArray(value) && 
             typeof field.value === 'number' && 
             field.value >= 0 && 
             field.value < value.length;
    } else {
      return typeof value === 'object' && 
             value !== null && 
             !Array.isArray(value) && 
             field.value in value;
    }
  }
}
```

### Benefits:
1. **Compile-time Validation**: Many field access errors can be caught during development
2. **Centralized Logic**: Encapsulates field access in a single, well-tested component
3. **Cleaner Error Handling**: Simplifies error handling with type predicates
4. **Improved Testability**: Makes field access logic easier to test in isolation

## 3. Resolution Context Type Enhancement

### Current Issues:
- Context object is loosely typed with many properties cast as `any`
- Context flags like `isVariableEmbed` and `disablePathPrefixing` lack proper typing
- Context depth tracking for circular references uses type assertions
- Context extension with additional properties is error-prone

### Proposed Solution:
```typescript
// Base resolution context
interface ResolutionContext {
  state: IStateService;
  strict: boolean;
  depth?: number;
  allowedVariableTypes?: VariableType[];
}

// Extended contexts for specific resolution scenarios
interface VariableEmbedContext extends ResolutionContext {
  isVariableEmbed: true;
  disablePathPrefixing?: boolean;
}

interface FieldAccessContext extends ResolutionContext {
  preserveType?: boolean;
  parentVariableName?: string;
}

// Type guard for context types
function isVariableEmbedContext(
  context: ResolutionContext
): context is VariableEmbedContext {
  return 'isVariableEmbed' in context && context.isVariableEmbed === true;
}

// Type-safe context creation
function createResolutionContext(
  state: IStateService,
  options: Partial<ResolutionContext> = {}
): ResolutionContext {
  return {
    state,
    strict: false,
    ...options,
    depth: options.depth ?? 0
  };
}
```

### Benefits:
1. **Type Safety**: Prevents misuse of context properties and flags
2. **Explicit Intentions**: Makes the purpose of each context type clear
3. **Reduced Type Assertions**: Eliminates need for `as any` casts
4. **Simplified Conditionals**: Type guards provide cleaner context type checking

## 4. Formatting Context Enums and Types

### Current Issues:
- Formatting decisions use boolean flags and string literals
- The relationship between formatting parameters is unclear
- Format determination logic is scattered and duplicated
- Special case handling for arrays and complex structures

### Proposed Solution:
```typescript
// Formatting mode enum
enum FormatMode {
  INLINE = 'inline',
  BLOCK = 'block'
}

// Node position for context-aware formatting
enum LinePosition {
  START = 'start',
  MIDDLE = 'middle',
  END = 'end'
}

// Comprehensive formatting context
interface FormattingContext {
  mode: FormatMode;
  nodeType?: string;
  linePosition?: LinePosition;
  isTransformation?: boolean;
}

// Type-safe formatter
class VariableFormatter {
  static format(
    value: VariableValue,
    context: FormattingContext
  ): string {
    // Implementation with proper type handling
  }
  
  // Specialized formatters for different types
  static formatObject(
    obj: VariableObject,
    context: FormattingContext
  ): string {
    return context.mode === FormatMode.BLOCK
      ? JSON.stringify(obj, null, 2)
      : JSON.stringify(obj);
  }
  
  static formatArray(
    arr: VariableArray,
    context: FormattingContext
  ): string {
    // Array-specific formatting logic
  }
}
```

### Benefits:
1. **Consistent Formatting**: Ensures consistent formatting decisions across the codebase
2. **Self-Documenting Code**: Makes formatting intentions explicit
3. **Centralized Logic**: Consolidates formatting logic in one place
4. **Extensibility**: Makes it easy to add new formatting options

## 5. Variable Reference Node Type System

### Current Issues:
- Multiple variable node types with overlapping properties
- Type checking relies on runtime property checks
- Legacy node types maintained for backward compatibility
- Factory pattern implementation mixes with direct type checking

### Proposed Solution:
```typescript
// Base variable reference interface
interface IVariableReference {
  type: 'VariableReference';
  identifier: string;
  valueType: VariableType;
  fields?: Field[];
  isVariableReference: boolean;
}

// Enum for variable types
enum VariableType {
  TEXT = 'text',
  DATA = 'data',
  PATH = 'path'
}

// Type guards using discriminated unions
function isVariableReferenceNode(node: MeldNode): node is IVariableReference {
  return node.type === 'VariableReference' && 
         'identifier' in node &&
         'valueType' in node;
}

// Factory with proper typing
class VariableNodeFactory {
  createVariableReferenceNode(
    identifier: string,
    valueType: VariableType,
    fields?: Field[]
  ): IVariableReference {
    return {
      type: 'VariableReference',
      identifier,
      valueType,
      fields,
      isVariableReference: true
    };
  }
}
```

### Benefits:
1. **Type Consistency**: Ensures consistent node structure across the codebase
2. **Cleaner Type Guards**: Simplifies node type checking
3. **Better Factory Pattern**: Makes factory pattern more effective with proper types
4. **Reduced Legacy Code**: Provides a path to eliminate legacy type handling

## 6. Error Handling Type System

### Current Issues:
- Error creation is inconsistent and scattered
- Error details vary based on the error scenario
- Error handling logic is duplicated across methods
- Error tracking lacks proper typing

### Proposed Solution:
```typescript
// Specific error types
enum VariableErrorType {
  VARIABLE_NOT_FOUND = 'variable-not-found',
  FIELD_NOT_FOUND = 'field-not-found',
  INVALID_ACCESS = 'invalid-access',
  INDEX_OUT_OF_BOUNDS = 'index-out-of-bounds',
  CIRCULAR_REFERENCE = 'circular-reference',
  MAX_DEPTH_EXCEEDED = 'max-depth-exceeded'
}

// Structured error details
interface VariableErrorDetails {
  variableName: string;
  fieldPath?: string;
  availableFields?: string[];
  index?: number;
  arrayLength?: number;
  expectedType?: string;
  actualType?: string;
  depth?: number;
}

// Enhanced error factory
class VariableResolutionErrorFactory {
  static create(
    type: VariableErrorType,
    message: string,
    details: VariableErrorDetails
  ): MeldResolutionError {
    return new MeldResolutionError(message, {
      code: type,
      severity: ErrorSeverity.Error,
      details
    });
  }
  
  // Convenience methods for common errors
  static variableNotFound(name: string): MeldResolutionError {
    return this.create(
      VariableErrorType.VARIABLE_NOT_FOUND,
      `Variable '${name}' not found`,
      { variableName: name }
    );
  }
  
  // Other error type methods...
}
```

### Benefits:
1. **Consistent Errors**: Ensures consistent error structure and messages
2. **Detailed Error Information**: Provides structured error details for better debugging
3. **Type Safety**: Prevents missing required error details
4. **Centralized Error Creation**: Consolidates error creation logic

## Implementation Strategy and Impact

To implement these improvements:

1. **Start with Core Types**: Implement the `VariableValue` and related types first
2. **Gradual Migration**: Update methods one at a time to use the new type system
3. **Backward Compatibility**: Maintain compatibility layers during transition
4. **Unit Tests**: Add tests to verify type-safe behavior

These changes will have a significant impact:

1. **Reduced Bug Surface**: Fewer runtime errors from type mismatches
2. **Improved Developer Experience**: Better IDE support and self-documenting code
3. **Simplified Logic**: Less defensive coding and runtime type checking
4. **Better Maintainability**: Clearer code structure and intentions
5. **Enhanced Performance**: Potential performance improvements from reduced type checking

By implementing these type system improvements, the VariableHandler service will become more robust, easier to maintain, and less prone to bugs, ultimately improving the reliability of the entire Meld language interpreter.