# Consolidated Requirements for Meld Variable Handling

## Core Variable Type System

- **Base Variable Interface**: Implement a common interface `IVariable<T>` with discriminated union pattern for type safety:
  ```typescript
  interface IVariable<T> {
    type: VariableType;  // Discriminator
    name: string;
    value: T;
    sourceLocation?: SourceLocation;
    lastModified: number;
    isImmutable: boolean;
  }
  
  enum VariableType {
    TEXT = 'text',
    DATA = 'data',
    PATH = 'path',
    COMMAND = 'command'
  }
  ```

- **Strongly-Typed Variable Containers**: Replace direct Map usage with type-safe stores:
  ```typescript
  interface IVariableStore<T extends IVariable<any>> {
    get(name: string): T['value'] | undefined;
    set(name: string, value: T['value'], context?: StateUpdateContext): void;
    has(name: string): boolean;
    delete(name: string): boolean;
    entries(): IterableIterator<[string, T['value']]>;
    clone(): IVariableStore<T>;
  }
  ```

- **Specific Variable Types**: Implement concrete types with appropriate value constraints:
  ```typescript
  interface ITextVariable extends IVariable<string> {
    type: VariableType.TEXT;
  }
  
  interface IDataVariable extends IVariable<DataValue> {
    type: VariableType.DATA;
  }
  
  interface IPathVariable extends IVariable<string> {
    type: VariableType.PATH;
  }
  
  interface ICommandVariable extends IVariable<CommandDefinition> {
    type: VariableType.COMMAND;
  }
  ```

## Data Structure Types

- **Data Value Types**: Define structured types for data variables:
  ```typescript
  type DataPrimitive = string | number | boolean | null;
  type DataArray = DataValue[];
  type DataObject = Record<string, DataValue>;
  type DataValue = DataPrimitive | DataArray | DataObject;
  
  // Type guards
  function isDataObject(value: unknown): value is DataObject;
  function isDataArray(value: unknown): value is DataArray;
  function isDataPrimitive(value: unknown): value is DataPrimitive;
  ```

- **Command Definition**: Structured type for command variables:
  ```typescript
  interface CommandDefinition {
    command: string;
    options: Record<string, DataValue>;
    description?: string;
    sourceFile?: string;
    location?: SourceLocation;
  }
  ```

## Variable Reference & Resolution

- **Variable Reference Structure**: Unified structure for variable references:
  ```typescript
  interface IVariableReference {
    type: VariableType;
    name: string;
    fields?: FieldAccessPath;
    originalReference: string; // The raw reference string ({{var.field}}, $path, etc.)
  }
  
  type FieldAccessPath = Array<FieldAccessSegment>;
  
  interface FieldAccessSegment {
    type: 'identifier' | 'number' | 'string';
    value: string | number;
  }
  ```

- **Resolution Context**: Context object for variable resolution:
  ```typescript
  interface ResolutionContext {
    strict: boolean;  // Whether to throw on missing variables
    depth: number;    // Current resolution depth
    maxDepth: number; // Maximum allowed depth
    visited: Set<string>; // Variables already visited (for circularity detection)
    allowedVariableTypes?: VariableType[]; // Limit to specific variable types
    formattingMode: FormattingMode; // How to format resolved values
  }
  
  enum FormattingMode {
    INLINE,  // Compact, single-line representation
    BLOCK,   // Pretty-printed, multi-line representation
    RAW      // No formatting, return as-is
  }
  ```

- **Field Access Results**: Structured results from field access operations:
  ```typescript
  interface FieldAccessResult {
    value: DataValue;
    exists: boolean;
    isTerminal: boolean; // Whether this is a leaf node
    remainingPath?: FieldAccessPath; // Unused path segments if any
  }
  ```

## Validation Requirements

- **Identifier Validation**: Enforce consistent naming rules:
  ```typescript
  function validateIdentifier(name: string): boolean {
    // Alphanumeric, underscores, no spaces, not a reserved word
    return /^[a-zA-Z0-9_]+$/.test(name) && !RESERVED_KEYWORDS.includes(name);
  }
  ```

- **Existence Validation**: Check for variable existence before access:
  ```typescript
  function resolveVariable(
    ref: IVariableReference, 
    state: IStateService,
    context: ResolutionContext
  ): ResolvedValue {
    // Check existence based on strict mode
    if (!state.hasVariable(ref.type, ref.name)) {
      if (context.strict) {
        throw new VariableResolutionError(`Variable ${ref.name} not found`);
      }
      return { value: undefined, exists: false };
    }
    // Resolve the variable...
  }
  ```

- **Circular Reference Detection**: Prevent infinite resolution loops:
  ```typescript
  function detectCircularReference(
    varName: string, 
    context: ResolutionContext
  ): boolean {
    if (context.visited.has(varName)) {
      return true;
    }
    
    if (context.depth >= context.maxDepth) {
      throw new CircularReferenceError(
        `Maximum resolution depth (${context.maxDepth}) exceeded`
      );
    }
    
    // Update context for next resolution
    context.visited.add(varName);
    context.depth += 1;
    
    return false;
  }
  ```

- **Path Validation**: Ensure path variables are valid and secure:
  ```typescript
  function validatePath(path: string): boolean {
    // Check for directory traversal, invalid characters, etc.
    if (path.includes('..')) {
      throw new PathValidationError('Directory traversal not allowed');
    }
    
    // Additional path validation logic...
    return true;
  }
  ```

## State Management

- **State Update Context**: Track variable modifications:
  ```typescript
  interface StateUpdateContext {
    operation: 'set' | 'delete' | 'merge' | 'transform';
    source: string; // Source of the update (e.g., directive, import)
    timestamp: number;
    variableType: VariableType;
    variableName: string;
    sourceLocation?: SourceLocation;
  }
  ```

- **Source Location Tracking**: Track where variables are defined:
  ```typescript
  interface SourceLocation {
    file: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
  }
  ```

## String Conversion & Formatting

- **Type-Specific Formatters**: Convert different types to strings:
  ```typescript
  interface StringConversionOptions {
    mode: FormattingMode;
    indentLevel?: number;
    maxArrayItems?: number; // Limit array output
    maxObjectDepth?: number; // Limit object nesting in output
  }
  
  function convertToString(
    value: DataValue,
    options: StringConversionOptions
  ): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    
    if (Array.isArray(value)) {
      return formatArray(value, options);
    }
    
    if (typeof value === 'object') {
      return formatObject(value, options);
    }
    
    return String(value);
  }
  ```

## Key Design Decisions & Rationale

1. **Discriminated Union Pattern**: Chosen for variable types to enable compile-time type checking and exhaustive pattern matching, reducing runtime errors.

2. **Strict Typing with Type Guards**: Prioritized to catch type errors early and provide clear runtime validation.

3. **Context-Based Resolution**: Implemented comprehensive context objects to manage resolution state, formatting preferences, and validation rules in a centralized way.

4. **Immutability Controls**: Added to prevent accidental modification of variables that should remain constant.

5. **Formatting Modes as Enum**: Replaced boolean flags with an enum to make formatting intentions explicit and allow for future expansion.

6. **Circularity Detection**: Implemented robust tracking of visited variables and resolution depth to prevent infinite loops.

7. **Source Location Tracking**: Added to all variables to improve error reporting and debugging experience.

8. **Consistent Error Handling**: Standardized error types and messages across all variable operations.

The implementation prioritizes type safety, explicit context management, and robust validation to create a maintainable and predictable variable handling system.