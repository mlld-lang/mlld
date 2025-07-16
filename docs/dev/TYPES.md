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
  ArrayElement = 'array-element',
  ObjectProperty = 'object-property',
  FunctionArgument = 'function-argument',
  PipelineStage = 'pipeline-stage',
  
  // Extract raw value
  StringInterpolation = 'string-interpolation',
  CommandExecution = 'command-execution',
  FileOutput = 'file-output',
  Conditional = 'conditional',
  Display = 'display'
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

mlld preserves special array behaviors through metadata:

### RenamedContentArray
Used when loading content with header transformations:
```mlld
/var @sections = <*.md # Introduction> as "## Overview"
```

The array has metadata:
```typescript
{
  arrayType: 'renamed-content',
  joinSeparator: '\n\n',
  customToString: () => items.join('\n\n')
}
```

### LoadContentResultArray
Arrays of file metadata objects from glob patterns:
```mlld
/var @files = <*.json>
/show @files[0].filename  # Access metadata
```

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