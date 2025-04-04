# Proposed Variable Type Improvements for ResolutionService

After analyzing the ResolutionService implementation, I've identified several areas where TypeScript type enhancements would significantly improve code clarity, safety, and maintainability. These improvements focus on the variable handling system which is central to the Meld language's functionality.

## 1. Discriminated Union Types for Variable Values

### Current Issues:
- The codebase uses separate getter methods (`getTextVar`, `getDataVar`, `getPathVar`) with no type guarantees about the returned values
- Type assertions are frequently required when handling variable values
- Validation for variable type correctness happens at runtime

```typescript
// Current approach with ambiguous types:
let refValue: string | undefined;
switch (directiveNode.directive.kind) {
  case 'text':
    refValue = this.stateService.getTextVar(ref); // string | undefined
    break;
  case 'data':
    const dataValue = this.stateService.getDataVar(ref); // any
    if (dataValue && typeof dataValue === 'string') {
      refValue = dataValue;
    }
    break;
  // ...
}
```

### Proposed Solution:
Create a discriminated union type for variable values with guaranteed type safety:

```typescript
// Define a discriminated union for variable values
type VariableValue = 
  | { type: 'text'; value: string }
  | { type: 'data'; value: any }
  | { type: 'path'; value: string }
  | { type: 'command'; value: { command: string; args?: string[] } };

// StateService would return this typed value:
interface IStateService {
  getVariable(name: string): VariableValue | undefined;
  // ...other methods
}

// Usage becomes type-safe:
const variable = stateService.getVariable(ref);
if (variable) {
  switch (variable.type) {
    case 'text':
      return variable.value; // TypeScript knows this is string
    case 'data':
      return typeof variable.value === 'string' 
        ? variable.value 
        : JSON.stringify(variable.value);
    // ...
  }
}
```

### Benefits:
1. **Type Safety**: Eliminates runtime type checks and casts
2. **Self-Documenting**: The type clearly indicates what kind of variable it is
3. **Error Reduction**: Prevents accidental misuse of different variable types
4. **Simplified Logic**: Consolidates variable handling into a single pattern

## 2. Structured Field Access Types

### Current Issues:
- Field access paths are handled as plain strings with complex parsing logic
- Error handling for invalid field access is verbose and repetitive
- No compile-time verification of field access validity

```typescript
// Current approach with string-based field paths:
async resolveFieldAccess(variableName: string, fieldPath: string, context?: ResolutionContext): Promise<any> {
  // Get the base variable value
  const baseValue = context.state.getDataVar(variableName);
  
  if (baseValue === undefined) {
    throw VariableResolutionErrorFactory.variableNotFound(variableName);
  }
  
  try {
    // Complex field access logic with string parsing
    const result = FieldAccessUtility.accessFieldsByPath(
      baseValue,
      fieldPath,
      {
        arrayNotation: true,
        numericIndexing: true,
        preserveType: fieldAccessOptions.preserveType !== false,
        formattingContext: fieldAccessOptions.formattingContext
      },
      variableName,
      context.strict !== false
    );
    
    return result;
  } catch (error) {
    // Error handling...
  }
}
```

### Proposed Solution:
Define a structured field access path type with parser:

```typescript
// Define structured field path types
type FieldAccessSegment = 
  | { type: 'property'; name: string }
  | { type: 'index'; index: number };

type FieldAccessPath = FieldAccessSegment[];

// Parser function (implementation elsewhere)
function parseFieldPath(path: string): FieldAccessPath {
  // Parse the string path into structured segments
}

// Usage in the service
async resolveFieldAccess(
  variableName: string, 
  fieldPath: string, 
  context?: ResolutionContext
): Promise<any> {
  const baseValue = context.state.getDataVar(variableName);
  if (baseValue === undefined) {
    throw VariableResolutionErrorFactory.variableNotFound(variableName);
  }
  
  // Parse once, then use the structured path
  const accessPath = parseFieldPath(fieldPath);
  return this.accessByStructuredPath(baseValue, accessPath, {
    strict: context.strict !== false,
    variableName
  });
}

// Type-safe field access
private accessByStructuredPath(
  value: any, 
  path: FieldAccessPath, 
  options: { strict: boolean; variableName: string }
): any {
  let current = value;
  
  for (const segment of path) {
    if (current === null || current === undefined) {
      if (options.strict) {
        throw VariableResolutionErrorFactory.fieldAccessError(
          `Cannot access ${segment.type === 'property' ? segment.name : `[${segment.index}]`} on null/undefined`,
          options.variableName
        );
      }
      return undefined;
    }
    
    if (segment.type === 'property') {
      current = current[segment.name];
    } else { // index
      if (!Array.isArray(current) && typeof current !== 'string') {
        if (options.strict) {
          throw VariableResolutionErrorFactory.fieldAccessError(
            `Cannot use index access on non-array value`,
            options.variableName
          );
        }
        return undefined;
      }
      current = current[segment.index];
    }
  }
  
  return current;
}
```

### Benefits:
1. **Clearer Intent**: The code explicitly shows what kind of access is happening
2. **Better Error Messages**: Errors can pinpoint exactly which segment failed
3. **Reusability**: The parsed path can be reused without re-parsing
4. **Extensibility**: New access patterns can be added as new segment types

## 3. FormattingContext Type Enhancement

### Current Issues:
- Formatting context is passed as `any` type
- Inconsistent property access patterns for formatting options
- No type safety for formatting options

```typescript
// Current approach with any-typed options:
async convertToFormattedString(value: any, options?: any): Promise<string> {
  // Fall back to basic formatting
  if (value === undefined || value === null) {
    return '';
  } else if (typeof value === 'object') {
    try {
      // Check if this is a block context from options
      const isBlock = options?.formattingContext?.isBlock === true;
      const isTransformation = options?.formattingContext?.isTransformation === true;
      
      // For objects in block context or transformation mode, use pretty printing
      if ((isBlock || isTransformation) && (Array.isArray(value) || Object.keys(value).length > 0)) {
        return JSON.stringify(value, null, 2);
      }
      
      // For inline contexts, use compact representation
      return JSON.stringify(value);
    } catch (error) {
      // Error handling...
    }
  }
}
```

### Proposed Solution:
Create a well-defined formatting context type:

```typescript
// Define a structured formatting context
interface FormattingContext {
  // Display context
  isBlock: boolean;
  nodeType?: 'embed' | 'text' | 'data' | 'run';
  linePosition?: 'start' | 'middle' | 'end' | 'standalone';
  
  // Legacy flag (renamed for clarity)
  isTransformationMode: boolean;
  
  // Formatting options
  indentation?: number;
  preserveNewlines?: boolean;
  compactArrays?: boolean;
  compactObjects?: boolean;
}

// Options with the formatting context
interface StringConversionOptions {
  formattingContext: FormattingContext;
  maxLength?: number;
  ellipsis?: string;
}

// Updated method signature
async convertToFormattedString(
  value: any, 
  options?: Partial<StringConversionOptions>
): Promise<string> {
  // Default formatting context
  const context: FormattingContext = {
    isBlock: options?.formattingContext?.isBlock ?? false,
    isTransformationMode: options?.formattingContext?.isTransformationMode ?? false,
    // Set other defaults...
  };
  
  if (value === undefined || value === null) {
    return '';
  } else if (typeof value === 'object') {
    // Use context with type safety
    if ((context.isBlock || context.isTransformationMode) && 
        (Array.isArray(value) || Object.keys(value).length > 0)) {
      return JSON.stringify(value, null, context.indentation ?? 2);
    }
    
    return JSON.stringify(value);
  }
  
  return String(value);
}
```

### Benefits:
1. **Self-Documenting**: The type clearly shows all available formatting options
2. **Consistency**: Ensures all code uses the same property names
3. **Default Values**: Can provide sensible defaults for missing properties
4. **Type Checking**: Prevents typos in property names

## 4. Resolution Context Enhancements

### Current Issues:
- `ResolutionContext` contains a mix of required and optional properties
- Extra properties are added via type assertion (`(context as any).isVariableEmbed`)
- No validation for context completeness before use

```typescript
// Current approach with context type assertions:
private async resolveStructuredPath(path: StructuredPath, context?: ResolutionContext): Promise<string> {
  // IMPORTANT FIX: Check for special flags that indicate we should skip path resolution
  // This prevents directory paths from being added to variable content in embeds
  if ((resolveContext as any).isVariableEmbed === true || 
      (resolveContext as any).disablePathPrefixing === true) {
    logger.debug('Path prefixing disabled for this context (variable embed)', {
      raw: path.raw,
      isVariableEmbed: (resolveContext as any).isVariableEmbed,
      disablePathPrefixing: (resolveContext as any).disablePathPrefixing
    });
    
    // For variable embeds, return the raw value without path resolution
    if (typeof path === 'string') {
      return path;
    }
    return path.raw;
  }
  
  // ...
}
```

### Proposed Solution:
Create a context builder pattern with validation:

```typescript
// Enhanced resolution context with all properties properly typed
interface ResolutionContext {
  // Required properties
  state: StateServiceLike;
  allowedVariableTypes: {
    text: boolean;
    data: boolean;
    path: boolean;
    command: boolean;
  };
  
  // Optional properties with proper types
  currentFilePath?: string;
  pathValidation?: {
    requireAbsolute: boolean;
    allowedRoots: string[];
  };
  allowDataFields?: boolean;
  strict?: boolean;
  allowNested?: boolean;
  
  // Previously casted properties now properly defined
  isVariableEmbed?: boolean;
  disablePathPrefixing?: boolean;
  preventPathPrefixing?: boolean;
  
  // Properly typed field access options
  fieldAccessOptions?: {
    preserveType?: boolean;
    formattingContext?: FormattingContext;
    arrayNotation?: boolean;
    numericIndexing?: boolean;
    variableName?: string;
  };
}

// Context builder
class ResolutionContextBuilder {
  private context: Partial<ResolutionContext> = {
    allowedVariableTypes: {
      text: true,
      data: true,
      path: true,
      command: true
    },
    strict: true
  };
  
  withState(state: StateServiceLike): ResolutionContextBuilder {
    this.context.state = state;
    return this;
  }
  
  withCurrentFilePath(path: string): ResolutionContextBuilder {
    this.context.currentFilePath = path;
    return this;
  }
  
  disableVariableType(type: keyof ResolutionContext['allowedVariableTypes']): ResolutionContextBuilder {
    if (this.context.allowedVariableTypes) {
      this.context.allowedVariableTypes[type] = false;
    }
    return this;
  }
  
  forVariableEmbed(isEmbed: boolean = true): ResolutionContextBuilder {
    this.context.isVariableEmbed = isEmbed;
    if (isEmbed) {
      this.context.disablePathPrefixing = true;
    }
    return this;
  }
  
  // Add more builder methods...
  
  build(): ResolutionContext {
    // Validate required fields
    if (!this.context.state) {
      throw new Error('ResolutionContext requires a state service');
    }
    
    return this.context as ResolutionContext;
  }
}

// Usage
const context = new ResolutionContextBuilder()
  .withState(this.stateService)
  .withCurrentFilePath(filePath)
  .forVariableEmbed()
  .build();

// In resolveStructuredPath
if (context.isVariableEmbed || context.disablePathPrefixing) {
  // Now properly typed, no casting needed
  logger.debug('Path prefixing disabled for this context', {
    raw: path.raw,
    isVariableEmbed: context.isVariableEmbed,
    disablePathPrefixing: context.disablePathPrefixing
  });
  
  return typeof path === 'string' ? path : path.raw;
}
```

### Benefits:
1. **Type Safety**: All context properties are properly typed
2. **Validation**: Required properties are enforced at build time
3. **Fluent API**: Context creation is more readable and self-documenting
4. **Default Values**: Sensible defaults can be provided in the builder

## 5. Generic Type for Variable Resolution Results

### Current Issues:
- Resolution methods return `any` or `string` with no type information
- Type assertions needed when using resolved values
- No compile-time guarantee that resolution matches expected type

```typescript
// Current approach with any return type:
async resolveData(ref: string, context: ResolutionContext): Promise<any> {
  const nodes = await this.parseForResolution(ref);
  return this.dataResolver.resolve(nodes[0] as DirectiveNode, context);
}

// Usage requires type assertions or checks
const userData = await resolutionService.resolveData('user', context);
if (typeof userData === 'object' && userData !== null) {
  const userName = userData.name; // No type safety
}
```

### Proposed Solution:
Add generic type parameters to resolution methods:

```typescript
// Generic resolution methods
async resolveData<T = any>(
  ref: string, 
  context: ResolutionContext,
  typeValidator?: (value: any) => value is T
): Promise<T> {
  const nodes = await this.parseForResolution(ref);
  const result = await this.dataResolver.resolve(nodes[0] as DirectiveNode, context);
  
  // Validate the type if a validator is provided
  if (typeValidator && !typeValidator(result)) {
    throw new MeldResolutionError(
      `Resolution result for "${ref}" does not match expected type`,
      {
        code: ResolutionErrorCode.INVALID_TYPE,
        details: { value: ref, expectedType: 'custom', actualType: typeof result },
        severity: ErrorSeverity.Fatal
      }
    );
  }
  
  return result as T;
}

// Type predicates for common types
function isUserProfile(value: any): value is UserProfile {
  return typeof value === 'object' && value !== null && 
         typeof value.name === 'string' && 
         typeof value.email === 'string';
}

// Usage with type safety
interface UserProfile {
  name: string;
  email: string;
  preferences?: {
    theme: string;
    notifications: boolean;
  };
}

// Type-safe resolution
const userData = await resolutionService.resolveData<UserProfile>(
  'user', 
  context,
  isUserProfile
);

// TypeScript knows userData is UserProfile
const userName = userData.name; // Properly typed as string
const theme = userData.preferences?.theme; // Optional chaining works
```

### Benefits:
1. **Type Safety**: Resolution results have proper types
2. **Validation**: Optional runtime validation ensures type correctness
3. **IDE Support**: Better autocomplete and type hints
4. **Error Prevention**: Catches type mismatches early

## 6. Enum Types for Variable Reference Syntax

### Current Issues:
- Variable reference syntax is checked using string includes (`value.includes('{{')`)
- No centralized definition of variable reference patterns
- Hard to track all supported syntax variations

```typescript
// Current approach with string checks:
private async resolveVariables(value: string, context: ResolutionContext): Promise<string> {
  // Check if the string contains variable references
  if (value.includes('{{') || value.includes('${') || value.includes(')) {
    logger.debug('Resolving variables in string:', { value });
    // ...resolution logic
  }
  
  return value;
}
```

### Proposed Solution:
Create an enum and pattern registry for variable syntax:

```typescript
// Define variable reference patterns
enum VariableReferencePattern {
  TEXT_VARIABLE = 'TEXT_VARIABLE',         // {{var}}
  LEGACY_TEXT_VARIABLE = 'LEGACY_TEXT_VARIABLE', // ${var}
  DATA_FIELD_ACCESS = 'DATA_FIELD_ACCESS', // {{var.field}}
  PATH_VARIABLE = 'PATH_VARIABLE',         // $var
  COMMAND_REFERENCE = 'COMMAND_REFERENCE', // $command(args)
  SPECIAL_PATH = 'SPECIAL_PATH'            // $HOMEPATH, $PROJECTPATH, $., $~
}

// Pattern registry
const VARIABLE_PATTERNS: Record<VariableReferencePattern, RegExp> = {
  [VariableReferencePattern.TEXT_VARIABLE]: /\{\{([^\.}]+)\}\}/g,
  [VariableReferencePattern.LEGACY_TEXT_VARIABLE]: /\$\{([^\.}]+)\}/g,
  [VariableReferencePattern.DATA_FIELD_ACCESS]: /\{\{([^}]+\.[^}]+)\}\}/g,
  [VariableReferencePattern.PATH_VARIABLE]: /\$([a-zA-Z0-9_]+)/g,
  [VariableReferencePattern.COMMAND_REFERENCE]: /\$([a-zA-Z0-9_]+)\(([^)]*)\)/g,
  [VariableReferencePattern.SPECIAL_PATH]: /\$(HOMEPATH|\.|~)/g
};

// Helper to detect variable references
function containsVariableReferences(value: string): boolean {
  return Object.values(VARIABLE_PATTERNS).some(pattern => pattern.test(value));
}

// Helper to identify specific patterns
function identifyVariablePatterns(value: string): VariableReferencePattern[] {
  return Object.entries(VARIABLE_PATTERNS)
    .filter(([_, pattern]) => pattern.test(value))
    .map(([key]) => key as VariableReferencePattern);
}

// Usage in the service
private async resolveVariables(value: string, context: ResolutionContext): Promise<string> {
  // Check if the string contains variable references
  if (containsVariableReferences(value)) {
    const patterns = identifyVariablePatterns(value);
    logger.debug('Resolving variables in string:', { value, patterns });
    
    // Resolution logic can now be pattern-specific
    // ...
  }
  
  return value;
}
```

### Benefits:
1. **Centralized Patterns**: All variable reference syntaxes defined in one place
2. **Pattern Recognition**: Can identify specific variable types in strings
3. **Maintainability**: Adding new patterns only requires updating the registry
4. **Testing**: Easier to test pattern recognition separately from resolution

## Implementation Priority and Impact

Based on the potential impact and implementation complexity, I recommend prioritizing these improvements in the following order:

1. **Discriminated Union Types for Variable Values** - Highest impact with moderate implementation effort
2. **Resolution Context Enhancements** - Eliminates many type assertions and improves safety
3. **FormattingContext Type Enhancement** - Makes output formatting more predictable and maintainable
4. **Structured Field Access Types** - Simplifies complex field access logic
5. **Generic Type for Variable Resolution Results** - Improves API type safety
6. **Enum Types for Variable Reference Syntax** - Centralizes pattern definitions

These improvements would significantly enhance the ResolutionService by:

1. **Reducing Type Assertions**: Eliminating most `as any` casts and manual type checks
2. **Improving Error Messages**: More specific errors with better context
3. **Enhancing IDE Support**: Better autocomplete and refactoring capabilities
4. **Preventing Bugs**: Catching type mismatches at compile time rather than runtime
5. **Simplifying Logic**: Replacing complex string manipulation with structured types

The implementation approach should be incremental, starting with the core variable value types and gradually extending to the more complex enhancements.