# @DEBUG Variable Architecture

## Overview

The `@DEBUG` variable is a built-in reserved variable in mlld that provides comprehensive debugging information about the current execution environment. It's designed to be lazy-evaluated, meaning its value is computed only when accessed, ensuring it always reflects the current state.

## Key Characteristics

1. **Lazy Evaluation**: Unlike other reserved variables, @DEBUG has `isLazy: true` metadata, causing its value to be computed on-demand
2. **Markdown Output**: Returns beautifully formatted markdown (not JSON) for human readability
3. **Case Insensitive**: Both `@DEBUG` and `@debug` work identically
4. **Context Aware**: Shows information specific to the current file and execution context

## Architecture Flow

### 1. Initialization Phase
```typescript
// In Environment.ts - initializeReservedVariables()
const debugVar: MlldVariable = {
  type: 'data',
  value: null, // Lazy - computed on access
  nodeId: '',
  location: { line: 0, column: 0 },
  metadata: {
    isReserved: true,
    isLazy: true, // Key flag for lazy evaluation
    definedAt: { line: 0, column: 0, filePath: '<reserved>' }
  }
};
this.variables.set('DEBUG', debugVar);
```

### 2. Variable Resolution
When `@DEBUG` is accessed (e.g., via `@add @DEBUG`):

```typescript
// In Environment.ts - getVariable()
if (variable.metadata?.isLazy && variable.value === null) {
  if (name.toUpperCase() === 'DEBUG') {
    const debugValue = this.createDebugObject(3); // Version 3 = markdown
    return {
      ...variable,
      type: 'text', // Markdown is text type
      value: debugValue
    };
  }
}
```

### 3. Debug Object Creation
The `createDebugObject(version)` method generates the debug information:

- **Version 1**: Full environment dump as JSON (verbose)
- **Version 2**: Reduced JSON format (structured data)
- **Version 3**: Markdown format (human-readable) ← Currently used

### 4. Content Generation (Version 3)
The markdown version includes:

```markdown
## /path/to/current/file.mld debug:

### Environment variables:
VARIABLE1, VARIABLE2, ...
_(not available unless passed via @INPUT)_

### Global variables:
**@NOW**
- type: text
- value: "2025-06-20T03:00:00.000Z"

**@PROJECTPATH**
- type: text
- value: "/path/to/project"

### User variables:
**@myVariable**
- type: text
- value: "example value"
- defined at: relative/path.mld:15

### Pipeline Context:
- Current stage: 2 of 3
- Current command: @json
- Input type: string
- Input length: 45
- Input value: "{"name": "example", "data": [1, 2, 3]}"
- Previous stages:
  1. Raw input data...
  2. Transformed by @uppercase...

### Statistics:
- Total variables: 25
- Output nodes: 10
- Errors collected: 0
- Current file: /path/to/current/file.mld
- Base path: /path/to/project
```

## Information Categories

### 1. Environment Variables
- Lists all available environment variable names
- Values are hidden for security
- Filtered to exclude npm/system internals

### 2. Global Variables
- Shows all reserved variables (except @DEBUG itself)
- Includes @NOW, @PROJECTPATH, @INPUT
- Shows built-in transformers (@JSON, @XML, etc.)

### 3. User Variables
- All variables defined by the user
- Includes their type, truncated value, and source location
- Shows imported variables separately with import paths

### 4. Pipeline Context (v1.4.7+)
When @debug is evaluated during pipeline execution, it includes:
- Current stage number and total stages
- The command currently being executed
- Input data type, length, and preview
- Previous stage outputs for tracing data flow

This context is only available during active pipeline execution and helps debug complex data transformations.

### 5. Statistics
- Total variable count
- Number of output nodes generated
- Error count
- Current file path and base path

## Value Truncation

To prevent overwhelming output, values are truncated:
- Text values: First 50 characters + "... (X chars)"
- Objects: Shows `[object Object]` or similar
- Arrays: Shows first few elements

## Usage Patterns

### Direct Output
```mlld
@add @DEBUG
```

### Store and Manipulate
```mlld
@text debugInfo = @DEBUG
@add ::Debug at {{TIME}}: {{debugInfo}}::
```

### Conditional Debugging
```mlld
@when @DEBUG_MODE => @add @DEBUG
```

## Security Considerations

1. **Environment Variables**: Only names are shown, not values
2. **File Paths**: Relative paths shown when possible
3. **Sensitive Data**: Truncation prevents accidental exposure
4. **Security Toggle**: Future enhancement to disable via mlld.lock.json

## Implementation Files

- `interpreter/env/Environment.ts`:
  - `initializeReservedVariables()`: Sets up the lazy DEBUG variable
  - `getVariable()`: Handles lazy evaluation
  - `createDebugObject()`: Generates debug content
  - `truncateValue()`: Safely truncates long values
  
- `interpreter/eval/add.ts`:
  - Handles `@add @DEBUG` by getting the variable and outputting its text value

## Testing

### Unit Tests
The core functionality is tested in:
- `interpreter/env/debug.test.ts` - Unit tests for @DEBUG behavior

These tests verify:
1. Markdown output format (not JSON)
2. Presence of expected sections
3. Case insensitivity (`@debug` vs `@DEBUG`)
4. Lazy evaluation with current context
5. Value truncation for long content

### Fixture Tests
Test cases are located in:
- `tests/cases/valid/reserved/debug-variable/`
- `tests/cases/valid/reserved/debug-variable-lowercase/`

Note: Fixture tests for @DEBUG are inherently contextual and may vary based on:
- Environment variables present
- Current file paths
- Number of variables defined
- Runtime environment

For this reason, the unit tests provide more reliable verification of core functionality.