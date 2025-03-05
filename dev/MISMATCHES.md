# Meld AST and Integration Test Mismatches

## Summary of Failures

Integration tests in the API module (`npm test api`) are failing with several consistent patterns:

1. **Directive Validation Errors**:
   - "Path directive requires an 'identifier' property (string)"
   - "Define directive requires an 'identifier' property (string)"
   - "Embed directive requires a 'path' property (string)"
   - "Import directive: value.match is not a function"

2. **Unknown Node Type Errors**:
   - "Unknown node type: TextVar"

3. **Parser Errors**:
   - "Invalid code fence: missing opening or closing backticks"
   - Syntax errors in directive parsing

4. **Path Resolution and Validation Errors**:
   - "Paths with slashes must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths"

## AST Structure vs. Validation Requirements

### Path Directive AST Structure
```json
{
  "type": "Directive",
  "directive": {
    "kind": "path",
    "id": "docs",
    "path": {
      "raw": "$PROJECTPATH/docs",
      "structured": {
        "base": "$PROJECTPATH",
        "segments": [
          "docs"
        ],
        "variables": {
          "special": [
            "PROJECTPATH"
          ]
        }
      },
      "normalized": "$PROJECTPATH/docs"
    }
  }
}
```

### Text Directive AST Structure  
```json
{
  "type": "Directive",
  "directive": {
    "kind": "text",
    "identifier": "name",
    "source": "literal",
    "value": "Bob"
  }
}
```

### Data Directive AST Structure
```json
{
  "type": "Directive",
  "directive": {
    "kind": "data",
    "identifier": "config",
    "source": "literal",
    "value": {
      "value": 123,
      "other": "test",
      "nested": {
        "key": "value"
      }
    }
  }
}
```

### Import Directive AST Structure
```json
{
  "type": "Directive",
  "directive": {
    "kind": "import",
    "path": {
      "raw": "$PROJECTPATH/other.meld",
      "structured": {
        "base": "$PROJECTPATH",
        "segments": [
          "other.meld"
        ],
        "variables": {
          "special": [
            "PROJECTPATH"
          ]
        }
      },
      "normalized": "$PROJECTPATH/other.meld"
    }
  }
}
```

### Define Directive AST Structure
```json
{
  "type": "Directive",
  "directive": {
    "kind": "define",
    "name": "command",
    "command": {
      "kind": "run",
      "command": "echo hello"
    }
  }
}
```

### Embed Directive AST Structure
```json
{
  "type": "Directive",
  "directive": {
    "kind": "embed",
    "path": {
      "raw": "$PROJECTPATH/docs/somefile.md",
      "normalized": "$PROJECTPATH/docs/somefile.md",
      "structured": {
        "base": "$PROJECTPATH",
        "segments": [
          "docs",
          "somefile.md"
        ],
        "variables": {
          "special": [
            "PROJECTPATH"
          ]
        }
      }
    }
  }
}
```

## Detailed Analysis of Issues

After investigating the code, we've found several key issues causing the integration test failures:

### 1. Property Name Mismatches

There are clear differences between property names in the AST and what the validators expect:

| Directive | AST Property | Expected by Validator |
|-----------|-------------|------------------------|
| Path      | `id`        | `identifier`           |
| Define    | `name`      | `identifier`           |

For example, in the PathDirectiveValidator:
```typescript
if (!directive.identifier || typeof directive.identifier !== 'string') {
  throw new MeldDirectiveError(
    'Path directive requires an "identifier" property (string)',
    'path',
    node.location?.start,
    DirectiveErrorCode.VALIDATION_FAILED
  );
}
```

But in the AST, the property is named `id`:
```json
{
  "directive": {
    "kind": "path",
    "id": "docs",
    "path": { ... }
  }
}
```

### 2. Interface Definitions Mismatch

Looking at the PathDirectiveHandler's interface definition:
```typescript
interface PathDirective extends DirectiveData {
  kind: 'path';
  identifier: string;
  value: string | StructuredPath;
}
```

But the AST is producing:
```typescript
interface PathDirective {
  kind: 'path';
  id: string;
  path: { raw: string, structured: {...}, normalized: string };
}
```

Similar issues exist with other directive types.

### 3. Import Directive Type Error

The "value.match is not a function" error occurs in the ImportDirectiveValidator:

```typescript
// Try new format: @import [x,y,z] from [file.md] or @import [file.md] 
const newFormatMatch = value.match(/^\s*\[([^\]]+)\](?:\s+from\s+\[([^\]]+)\])?\s*$/);
```

This suggests that `value` in this context isn't a string as expected but is likely an object (the structured path object).

### 4. Unknown Node Type (TextVar)

The InterpreterService handles only three node types:
```typescript
switch (node.type) {
  case 'Text':
    // ...
  case 'Comment':
    // ...
  case 'Directive':
    // ...
  default:
    throw new MeldInterpreterError(
      `Unknown node type: ${node.type}`,
      'unknown_node',
      convertLocation(node.location)
    );
}
```

But some tests are creating or expecting `TextVar` nodes, which aren't one of these three types.

### 5. Path Validation and Resolution

The PathValidationError shows that paths are being validated with different rules than expected:
```
Paths with slashes must start with $. or $~ - use $. for project-relative paths and $~ for home-relative paths
```

## Root Cause Analysis

The root cause appears to be a mismatch between:

1. **What the AST is producing**: The AST parser is generating nodes with properties like `id` and `path`
2. **What the validators expect**: The validation layer expects properties like `identifier` and `value`
3. **What the handlers expect**: The directive handlers expect interfaces that match the validator expectations

This suggests one of two scenarios:

1. **Schema Evolution**: The AST schema has evolved but the validators and handlers haven't been updated to match
2. **API Mismatch**: The tests are using a different API or schema than what the implementation expects

## Comparison with Test Expectations

Looking at the test files, they seem to expect:

```typescript
// Path test
const content = `
  @path docs = "$PROJECTPATH/docs"
  @text docPath = \`Docs are at \${docs}\`
  \${docPath}
`;
```

This test expects the path directive to be processed properly, but the AST is producing `id` while the validator expects `identifier`.

## Exhaustive List of Required Updates

To align the validation and handling layers with the AST structure, we need to make the following changes:

### 1. Path Directive Updates

**File**: `services/resolution/ValidationService/validators/PathDirectiveValidator.ts`
- Change `directive.identifier` to `directive.id` in validation checks
- Change error message from "requires an 'identifier' property" to "requires an 'id' property" if needed
- Change validation of value property to check for `directive.path` instead
- Update regex tests to validate `directive.id` format instead of `directive.identifier`

**File**: `services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.ts`
- Update interface definition to match AST:
  ```typescript
  interface PathDirective extends DirectiveData {
    kind: 'path';
    id: string;
    path: { 
      raw: string;
      structured: any; 
      normalized: string;
    };
  }
  ```
- In the execute method, change references from `identifier` to `id` and from `value` to `path.raw` or `path.normalized`

### 2. Define Directive Updates

**File**: `services/resolution/ValidationService/validators/DefineDirectiveValidator.ts`
- Change `directive.identifier` to `directive.name` in validation checks
- Change error message from "requires an 'identifier' property" to "requires a 'name' property" if needed
- Update regex tests to validate `directive.name` format instead of `directive.identifier`
- Change validation of value property to check for `directive.command` structure if needed

**File**: `services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.ts`
- Update interface definition to match AST:
  ```typescript
  interface DefineDirective extends DirectiveData {
    kind: 'define';
    name: string;
    command: {
      kind: string;
      command: string;
    };
  }
  ```
- In the execute method, change references from `identifier` to `name` and from `value` to appropriate `command` properties

### 3. Import Directive Updates

**File**: `services/resolution/ValidationService/validators/ImportDirectiveValidator.ts`
- Update to handle the structured path object:
  ```typescript
  // Change:
  const value = directive.value || directive.path;
  
  // To:
  const value = directive.value || 
    (typeof directive.path === 'string' ? directive.path : 
      (directive.path && directive.path.raw ? directive.path.raw : null));
  ```
- Ensure the `value.match()` is only called on string values
- Add type checks before attempting string operations

**File**: `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.ts`
- Update interface definition to match AST:
  ```typescript
  interface ImportDirective extends DirectiveData {
    kind: 'import';
    path: {
      raw: string;
      structured: any;
      normalized: string;
    };
  }
  ```
- Update path resolution to use the structured path object correctly

### 4. Embed Directive Updates

**File**: `services/resolution/ValidationService/validators/EmbedDirectiveValidator.ts`
- Update validation to handle the structured path object: 
  ```typescript
  // Check the path exists in the appropriate format
  if ((!directive.path || 
      (typeof directive.path !== 'string' && 
       (!directive.path.raw || typeof directive.path.raw !== 'string')))) {
    throw new MeldDirectiveError(
      'Embed directive requires a valid path',
      'embed',
      node.location?.start,
      DirectiveErrorCode.VALIDATION_FAILED
    );
  }
  ```

**File**: `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.ts`
- Update interface definition to match AST
- Update path resolution to use the structured path object correctly

### 5. TextVar Node Support

**File**: `services/pipeline/InterpreterService/InterpreterService.ts`
- Add a case for 'TextVar' in the switch statement:
  ```typescript
  switch (node.type) {
    case 'Text':
      // existing code...
      break;
    case 'TextVar':
      // Handle TextVar nodes
      // Create new state for TextVar node
      const textVarState = currentState.clone();
      textVarState.addNode(node);
      currentState = textVarState;
      break;
    case 'Comment':
      // existing code...
      break;
    case 'Directive':
      // existing code...
      break;
    default:
      throw new MeldInterpreterError(
        `Unknown node type: ${node.type}`,
        'unknown_node',
        convertLocation(node.location)
      );
  }
  ```

### 6. Path Validation Rules Updates

**File**: `services/fs/PathService/PathService.ts`
- Review and update path validation rules to align with test expectations
- Add support for `$PROJECTPATH` and `$HOMEPATH` special variables if not already present
- Consider checking if the validation rules in `validateMeldPath` need to be updated

### 7. Node Type Definitions

**File**: Relevant AST type definition files
- Ensure TextVar nodes are properly exported and defined in the type system
- Review `meld-spec` type definitions to ensure consistency

### 8. Test Suite Updates

- Review tests to ensure they align with the updated validators
- Consider updating some test cases if they explicitly depend on the old property names
- Ensure integration tests are using the correct syntax for code fences

## Recent Fixes for Variable Interpolation

We've made significant progress on fixing variable interpolation issues in both text and data variable contexts. The following improvements have been implemented:

### 1. Data Field Access in Templates

**Problem**: Tests were failing with errors when accessing fields within data variables using the `#{user.name}` syntax. The `ResolutionService` was not properly handling this syntax pattern.

**Files Affected**: 
- `services/resolution/ResolutionService/ResolutionService.ts`
- `services/pipeline/OutputService/OutputService.ts`

**Issues Found**:
- The `resolveInContext` method in `ResolutionService` recognized data variables in the format `#{varName}` but not nested fields like `#{varName.field}`
- The `OutputService` had similar logic for processing templates but with a different implementation
- Inconsistency between services led to different behavior depending on where variables were resolved

**Fix Implemented**:
- Enhanced the regex pattern to capture data variables: `const dataVarRegex = /#{([^}]+)}/g`
- Added field access logic to traverse nested properties in both services:
  ```typescript
  // Follow the field path
  if (parts.length > 1) {
    try {
      fieldValue = parts.slice(1).reduce((obj: any, field) => {
        if (obj === undefined || obj === null) {
          throw new Error(`Cannot access field ${field} on undefined or null value`);
        }
        return obj[field];
      }, dataVar);
    } catch (e) {
      throw new MeldResolutionError(
        `Error accessing field '${parts.slice(1).join('.')}' in data variable '${varName}'`,
        {
          code: ResolutionErrorCode.FIELD_ACCESS_ERROR,
          details: { 
            value: fieldRef, 
            context: JSON.stringify(context),
            fieldPath: parts.slice(1).join('.'),
            variableName: varName,
            variableType: 'data'
          },
          severity: ErrorSeverity.Recoverable
        }
      );
    }
  }
  ```
- Added proper error handling for field access failures with detailed error information

### 2. Array Formatting in Template Output

**Problem**: When using array data in templates, arrays were being output as JSON arrays (e.g., `["text","data","path"]`), but the tests expected comma-separated strings (e.g., `text,data,path`).

**Files Affected**:
- `services/resolution/ResolutionService/ResolutionService.ts`
- `services/pipeline/OutputService/OutputService.ts`

**Fix Implemented**:
- Updated the field value conversion logic in both services to detect arrays and join them with commas:
  ```typescript
  // Convert to string if necessary
  const stringValue = typeof fieldValue === 'object' 
    ? (Array.isArray(fieldValue) ? fieldValue.join(',') : JSON.stringify(fieldValue))
    : String(fieldValue);
  ```
- Maintained consistent behavior between `ResolutionService` and `OutputService`

### 3. Consistency Between Services

**Problem**: Variable resolution logic was duplicated across multiple services with subtle differences in implementation, leading to inconsistent behavior.

**Strategy Used**:
- Applied identical fixes to both the `ResolutionService` and `OutputService`
- Used the same pattern for detecting and processing data field references
- Ensured consistent formatting of different data types (particularly arrays)

### Learnings

1. **Service Consistency Pattern**: We found that maintaining consistency between services that handle similar tasks is critical. When a feature like variable interpolation is implemented in multiple places, changes need to be applied uniformly.

2. **Type-Aware String Conversion**: Different data types require different string conversion strategies for optimal user experience:
   - Arrays are best represented as comma-separated values
   - Objects need proper JSON serialization
   - Primitives can use simple string conversion

3. **Robust Error Handling**: Field access errors now provide contextually rich information:
   - The field path that failed
   - The variable name being accessed
   - The variable type
   - A clear error message indicating what went wrong

4. **Test-Driven Approach**: The test cases provided clear expectations about how variable interpolation should work:
   - `should handle data variable definitions and field access` - Expected `#{user.name}` to resolve to the name value
   - `should handle complex nested data structures` - Expected arrays to format as comma-separated strings

### Tests Now Passing

These fixes have resolved the integration tests for:
- `should handle data variable definitions and field access`
- `should handle complex nested data structures`

All tests in the "Variable Definitions and References" group are now passing.

## Next Steps

Let's address the remaining issues in the following order:

1. Add support for TextVar and DataVar node types in the InterpreterService
2. Fix the import directive validation and handling
3. Update path validation rules to match test expectations
4. Fix command resolution
5. Address output conversion issues
6. Fix code fence parsing

## Implementation Strategy

We'll continue with the direct codebase alignment approach rather than using adapters, and make changes to:

1. Update the InterpreterService to handle all node types
2. Fix specific validators and handlers for each directive type
3. Align error messages with test expectations
