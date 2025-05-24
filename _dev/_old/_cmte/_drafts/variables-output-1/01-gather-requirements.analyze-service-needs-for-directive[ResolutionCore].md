# Improving Variable Handling Types in ResolutionService

After reviewing the ResolutionService code and the variable handling documentation, I've identified several areas where stronger TypeScript typing would significantly improve the robustness, maintainability, and developer experience of the variable resolution system.

## 1. Strongly Typed Variable Values

### Current Issue
The service currently uses generic types (`any`) for variable values, which leads to several problems:

```typescript
// Examples from current code:
const baseValue = context.state.getDataVar(variableName); // returns any
const dataValue = this.stateService.getDataVar(ref); // returns any
refValue = this.stateService.getTextVar(ref); // returns string | undefined
```

This lack of type specificity causes:
- Unpredictable behavior when processing different variable types
- Runtime errors when accessing fields on incompatible types
- Difficulty tracking the expected shape of data variables

### Proposed Solution
Create a discriminated union type for variable values:

```typescript
type TextVariableValue = string;

type DataVariableValue = 
  | string 
  | number 
  | boolean 
  | null
  | DataObject
  | DataArray;

interface DataObject {
  [key: string]: DataVariableValue;
}

interface DataArray extends Array<DataVariableValue> {}

type PathVariableValue = string;

type CommandVariableValue = {
  command: string;
  args?: string[];
}

type VariableValue = 
  | { type: 'text', value: TextVariableValue } 
  | { type: 'data', value: DataVariableValue }
  | { type: 'path', value: PathVariableValue }
  | { type: 'command', value: CommandVariableValue };
```

### Justification
1. **Type Safety**: Eliminates runtime errors by enforcing type constraints at compile time
2. **Self-Documentation**: Makes the expected structure of each variable type explicit
3. **Improved IDE Support**: Enables autocomplete and type checking for field access
4. **Error Prevention**: Prevents accidental mixing of variable types
5. **Simplified Logic**: Reduces need for type checking and validation code

Using this approach, the code would become more robust:

```typescript
// With improved typing:
const baseValue = context.state.getDataVar(variableName); 
// If baseValue is undefined or not a data variable, TypeScript will flag it
if (baseValue?.type !== 'data') {
  throw VariableResolutionErrorFactory.variableNotFound(variableName);
}
// Now we know it's a data variable and can safely access its value
const result = FieldAccessUtility.accessFieldsByPath(baseValue.value, fieldPath, ...);
```

## 2. Enhanced Resolution Context Type

### Current Issue
The `ResolutionContext` interface has grown organically with ad-hoc properties:

```typescript
interface ResolutionContext {
  // Core properties
  currentFilePath?: string;
  allowedVariableTypes: { /* ... */ };
  pathValidation?: { /* ... */ };
  state: StateServiceLike;
  
  // Added later with inconsistent naming/structure
  allowDataFields?: boolean;
  strict?: boolean;
  allowNested?: boolean;
  isVariableEmbed?: boolean;
  disablePathPrefixing?: boolean;
  preventPathPrefixing?: boolean;
  fieldAccessOptions?: { /* ... */ };
}
```

This leads to:
- Inconsistent property names and structures
- Unclear relationships between properties
- Difficulty tracking which properties are used where
- Properties that should be mutually exclusive but aren't enforced as such

### Proposed Solution
Refactor the context into nested, purpose-specific interfaces with clearer relationships:

```typescript
interface ResolutionContext {
  // Core properties
  state: StateServiceLike;
  currentFilePath?: string;
  
  // Security controls
  security: {
    allowedVariableTypes: VariableTypePermissions;
    pathValidation?: PathValidationRules;
  };
  
  // Behavior controls
  behavior: {
    strict: boolean;
    allowNested: boolean;
  };
  
  // Format controls
  formatting: {
    isBlock: boolean;
    nodeType?: string;
    indentLevel?: number;
  };
  
  // Special flags consolidated into a single object
  flags: {
    isVariableEmbed?: boolean;
    disablePathPrefixing?: boolean;
    preventPathPrefixing?: boolean;
  };
  
  // Field access controls
  fieldAccess: {
    allowed: boolean;
    options: FieldAccessOptions;
  };
}

// Supporting types
interface VariableTypePermissions {
  text: boolean;
  data: boolean;
  path: boolean;
  command: boolean;
}

interface PathValidationRules {
  requireAbsolute: boolean;
  allowedRoots: string[];
  mustExist?: boolean;
}

interface FieldAccessOptions {
  preserveType: boolean;
  arrayNotation: boolean;
  numericIndexing: boolean;
  variableName?: string;
}
```

### Justification
1. **Logical Grouping**: Related properties are grouped together, making the structure more intuitive
2. **Explicit Defaults**: Can enforce sensible defaults through constructors or factories
3. **Reduced Duplication**: Default context creation can be centralized
4. **Clearer Intent**: The purpose of each property is clearer from its location in the structure
5. **Future Extensibility**: New properties can be added to the appropriate group without cluttering the top level

This approach also makes code more readable:

```typescript
// Before:
if (resolveContext.allowedVariableTypes.text === false) {
  throw new MeldResolutionError('Text variables not allowed');
}

// After:
if (resolveContext.security.allowedVariableTypes.text === false) {
  throw new MeldResolutionError('Text variables not allowed');
}
```

## 3. Field Access Path Type Safety

### Current Issue
Field access paths are currently handled as simple strings, with complex parsing and error-prone access logic:

```typescript
async resolveFieldAccess(variableName: string, fieldPath: string, context?: ResolutionContext): Promise<any> {
  // ...complex parsing and error handling...
  const result = FieldAccessUtility.accessFieldsByPath(
    baseValue,
    fieldPath,
    {
      arrayNotation: true,
      numericIndexing: true,
      // ...
    },
    variableName,
    context.strict !== false
  );
  // ...
}
```

This approach:
- Makes it hard to validate field paths at compile time
- Requires complex runtime parsing
- Leads to cryptic error messages
- Mixes access logic with validation logic

### Proposed Solution
Create a structured field path type and parser:

```typescript
type FieldAccessSegment = 
  | { type: 'property', name: string }
  | { type: 'index', value: number };

type FieldPath = FieldAccessSegment[];

// Parser function (implementation simplified)
function parseFieldPath(path: string): FieldPath {
  // Parse the path into segments
  return path.split('.')
    .flatMap(segment => {
      // Handle array notation like users[0]
      const arrayMatch = segment.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        return [
          { type: 'property', name: arrayMatch[1] },
          { type: 'index', value: parseInt(arrayMatch[2], 10) }
        ];
      }
      
      // Handle numeric segment
      if (/^\d+$/.test(segment)) {
        return [{ type: 'index', value: parseInt(segment, 10) }];
      }
      
      // Handle property segment
      return [{ type: 'property', name: segment }];
    });
}
```

### Justification
1. **Structured Access**: Makes the access path structure explicit and validatable
2. **Separation of Concerns**: Separates parsing from access logic
3. **Better Error Messages**: Can provide more specific error messages for each segment
4. **Performance**: Can cache parsed paths for frequently accessed fields
5.