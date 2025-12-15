# mlld Type System

This document describes mlld's Variable type system and how types are preserved from AST parsing through evaluation to final output.

## Overview

mlld uses a sophisticated Variable type system that preserves type information throughout the entire execution lifecycle. Variables are not just containers for values - they carry rich metadata about their origin, type, and behavior.

### Key Principles

1. **Type Preservation**: Variables maintain their type discriminators and metadata through transformation
2. **Behavior Encapsulation**: Special behaviors (custom toString, array joining) are preserved in metadata
3. **Context-Aware Resolution**: Variables can be preserved or extracted based on usage context
4. **Type Introspection**: Shadow environments can inspect Variable types at runtime

## Variable Type Hierarchy

All Variables implement the `Variable` interface, which is a discriminated union of specific types:

### Text Variables
- **SimpleTextVariable** (`simple-text`): Single-quoted strings without interpolation
- **InterpolatedTextVariable** (`interpolated-text`): Double-quoted strings with `@var` interpolation
- **TemplateVariable** (`template`): Template strings with various syntaxes:
  - `backtick`: Uses `@var` interpolation
  - `doubleColon`: Uses `@var` interpolation
  - `tripleColon`: Uses `{{var}}` interpolation (stored as AST for lazy evaluation)

### Content Variables
- **FileContentVariable** (`file-content`): Content loaded from files
- **SectionContentVariable** (`section-content`): Content from specific file sections

### Data Variables
- **ObjectVariable** (`object`): JavaScript objects, can be marked as "complex" for lazy evaluation
- **ArrayVariable** (`array`): JavaScript arrays, can be marked as "complex" for lazy evaluation
- **PrimitiveVariable** (`primitive`): Numbers, booleans, and null values

### Computed Variables
- **ComputedVariable** (`computed`): Results from code execution (js, node, python, sh)
- **CommandResultVariable** (`command-result`): Output from shell commands
- **ExecutableVariable** (`executable`): Reusable command/code definitions from `/exe`

### Special Variables
- **PathVariable** (`path`): Resolved file paths with security metadata
- **ImportedVariable** (`imported`): Variables imported from other files/modules
- **PipelineInputVariable** (`pipeline-input`): Wrapped inputs for pipeline stages

## Type Flow: AST to Variable

### 1. AST Parsing
The parser creates typed AST nodes based on syntax:
```mlld
/var @simple = 'text'           # Single quotes → simple-text
/var @interpolated = "Hello @name"  # Double quotes → interpolated-text
/var @template = `Count: @count`    # Backticks → template (backtick)
/var @data = { "key": "value" }     # Object literal → object
/var @list = [1, 2, 3]              # Array literal → array
/var @num = 42                      # Number literal → primitive
/var @flag = true                   # Boolean literal → primitive
/var @empty = null                  # Null literal → primitive
```

### 2. Variable Creation
The `evaluateVar` function in `interpreter/eval/var.ts` creates specific Variable types based on AST nodes:

```typescript
// Example: Creating an array variable
if (valueNode.type === 'array') {
  const isComplex = hasComplexArrayItems(valueNode.items);
  variable = createArrayVariable(identifier, resolvedValue, isComplex, source, metadata);
}
```

### 3. Metadata Preservation
Variables carry metadata that preserves special behaviors:

```typescript
interface VariableMetadata {
  // Array behaviors
  arrayType?: 'renamed-content' | 'load-content-result' | 'regular';
  joinSeparator?: string;  // '\n\n' for special arrays
  
  // Custom behaviors
  customToString?: () => string;
  customToJSON?: () => any;
  contentGetter?: () => string;
  
  // Transform tracking
  headerTransform?: {
    applied: boolean;
    template: string;
  };
}
```

## Enhanced Variable Resolution

The refactored system uses context-aware resolution to determine when to preserve Variables vs extract values:

### Resolution Contexts

```typescript
enum ResolutionContext {
  // Preserve Variable wrapper
  VariableAssignment = 'variable-assignment',
  VariableCopy = 'variable-copy',
  ArrayElement = 'array-element',
  ObjectProperty = 'object-property',
  FunctionArgument = 'function-argument',
  DataStructure = 'data-structure',
  FieldAccess = 'field-access',
  ImportResult = 'import-result',

  // Extract raw value
  StringInterpolation = 'string-interpolation',
  CommandExecution = 'command-execution',
  FileOutput = 'file-output',
  Conditional = 'conditional',
  Display = 'display',
  PipelineInput = 'pipeline-input',
  Truthiness = 'truthiness',
  Equality = 'equality'
}
```

### Example: Variables in Arrays

```mlld
/var @nums = [1, 2, 3]
/var @vars = [@nums, @name, run {echo "test"}]
```

In the enhanced system, `@vars` contains actual Variable objects, not extracted values. This preserves type information for downstream use.

## Shadow Environment Integration

### Variable Proxies

JavaScript and Node shadow environments receive Variables wrapped in proxies that provide:

1. **Transparent Value Access**: Use Variables like normal values
2. **Type Introspection**: Access type info via special properties
3. **Behavior Preservation**: Custom toString/toJSON methods work correctly

### mlld Helper Object

All shadow environments receive an `mlld` object with type introspection methods:

```javascript
// In JavaScript shadow environment
/exe @analyze(data) = js {
  if (mlld.isVariable(data)) {
    console.log('Type:', mlld.getType(data));
    console.log('Metadata:', mlld.getMetadata(data));
  }
  
  // Direct property access also works
  if (data.__mlld_type === 'array') {
    console.log('Array type:', data.__mlld_metadata.arrayType);
  }
  
  return data;  // Works like a normal value
}
```

### Primitive Handling

Since JavaScript primitives can't be proxied, the system uses metadata passthrough:

```javascript
/var @count = 42
/run js {
  // For primitives, use the parameter name
  console.log(mlld.isVariable(count, 'count'));  // true
  console.log(mlld.getType(count, 'count'));     // 'primitive'
}
```

### Bash/Shell Adapter

Bash and shell environments receive string values only (no type information) to maintain compatibility:

```bash
/var @name = "Alice"
/run bash {
  echo "Hello $name"  # Just the string value
}
```

## Special Array Types

mlld preserves special array behaviors through StructuredValue metadata:

### Arrays with renamed content
Used when loading content with header transformations:
```mlld
/var @sections = <*.md # Introduction> as "## Overview"
```

The array is wrapped as StructuredValue with metadata:
```typescript
{
  type: 'array',
  data: ['content1', 'content2'],
  text: 'content1\n\ncontent2',  // Custom join separator
  ctx: {
    source: 'load-content',
    // Additional metadata preserved here
  }
}
```

### Arrays of LoadContentResult items
Arrays of file metadata objects from glob patterns:
```mlld
/var @files = <*.json>
/show @files[0].filename  # Access metadata from ctx
```

Each item in the array is a StructuredValue with file metadata in `ctx`.

## Complex vs Simple Variables

Variables can be marked as "complex" when they contain unevaluated directives:

```mlld
/var @simple = [1, 2, 3]              # Simple - evaluated immediately
/var @complex = [run {date}, @other]  # Complex - lazy evaluation
```

Complex variables store the AST and evaluate on access, enabling:
- Deferred execution
- Circular reference handling
- Dynamic value updates

## Type Detection Best Practices

### Use Type Guards
```typescript
import { isArray, isObject, isPrimitive } from '@core/types/variable';

if (isArray(variable)) {
  // TypeScript knows this is ArrayVariable
  const items = variable.value;  // any[]
}
```

### Check Metadata First
```typescript
// Good - O(1) metadata check
if (variable.metadata?.arrayType === 'renamed-content') {
  // Handle renamed content array
}

// Bad - content inspection
if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
  // Unreliable type detection
}
```

### Preserve Variables When Possible
```typescript
// Good - preserves type information
const result = await resolveVariable(variable, env, ResolutionContext.ArrayElement);

// Less ideal - loses type information
const value = await resolveVariableValue(variable, env);
```

## Type Guard Patterns (Post Phase 3)

### When to Use Each Type Guard

**isStructuredValue(value)**
- Primary type guard for values in the evaluation pipeline
- All values from evaluate() are now StructuredValue
- Check `.type` property to determine content type: 'text', 'array', 'object', etc.
- Use `.ctx` to access metadata (filename, url, tokens, etc.)
- Use `.data` to access the underlying content/parsed data

**isFileLoadedValue(value)**
- Helper function for backward compatibility
- Handles both StructuredValue and LoadContentResult formats
- Returns true if value has file/URL metadata (`.ctx.filename` or `.ctx.url`)
- Use when code might receive either format during migration
- Defined in: `interpreter/utils/load-content-structured.ts`

**isLoadContentResult(value)**
- Use ONLY in factory/conversion layers
- Input validation before wrapping into StructuredValue
- Checking items inside arrays (may be unwrapped LoadContentResult objects)
- Primary usage: `load-content-structured.ts`, `content-loader.ts`

### Migration Complete

As of Phase 3 (StructuredValue migration):
- All arrays use StructuredValue with type='array'
- Pipeline code uses isStructuredValue or isFileLoadedValue
- Factory code keeps isLoadContentResult for inputs
- 33 legitimate isLoadContentResult usages remain in factory/conversion layers
- 188 isStructuredValue usages across the codebase
- 4 isFileLoadedValue usages for dual-format compatibility

### Example Usage

```typescript
// Pipeline code - check for StructuredValue
if (isStructuredValue(value)) {
  if (value.type === 'array') {
    // Handle array
    const items = value.data;
  }
  if (value.ctx?.filename) {
    // Has file metadata
    console.log('Loaded from:', value.ctx.filename);
  }
}

// Compatibility code - handle both formats
if (isFileLoadedValue(value)) {
  // Works for both StructuredValue and LoadContentResult
  const filename = isStructuredValue(value)
    ? value.ctx?.filename
    : value.filename;
}

// Factory code - validate inputs
if (isLoadContentResult(result)) {
  // Convert to StructuredValue
  return wrapLoadContentValue(result);
}
```

## Migration Notes

The type system refactor (Phase 0-5) transitioned from:
- **Old**: Extract values immediately, guess types from content
- **New**: Preserve Variables, use type discriminators

Key changes:
1. Variables flow through arrays and objects
2. Shadow environments receive full type information
3. Type detection uses metadata, not content inspection
4. Special behaviors preserved via metadata

See `TYPE-REFACTOR-ACTUAL-PLAN.md` for implementation details.
