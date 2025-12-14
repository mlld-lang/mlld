# mlld Type System

This document describes mlld's Variable type system and how types are preserved from AST parsing through evaluation to final output.

## Overview

mlld uses a sophisticated Variable type system that preserves type information throughout the entire execution lifecycle. Variables are not just containers for values - they carry rich metadata about their origin, type, and behavior.

## LoadContentResult vs StructuredValue Architecture

mlld has two distinct but related type systems for handling loaded content:

### Core Design Decisions

These architectural decisions ensure clean layering and proper separation of concerns:

#### 1. Layering: Core vs Interpreter

**Decision**: Core stays unaware of `STRUCTURED_VALUE_SYMBOL`; `isLoadContentResult()` remains a structural guard.

- `core/types/load-content.ts` defines LoadContentResult interface with structural properties
- `core/` does NOT import from `interpreter/` (maintains dependency direction)
- `isLoadContentResult()` checks for `{content, filename, relative, absolute}` structure (no symbol)
- `interpreter/utils/structured-value.ts` defines StructuredValue with `STRUCTURED_VALUE_SYMBOL`
- `interpreter/utils/load-content-structured.ts` bridges the two via `wrapLoadContentValue()`

**Why**: Prevents circular dependencies and keeps core types independent of runtime implementation.

#### 2. Generic Types: LoadContentResult Does NOT Extend StructuredValue

**Decision**: LoadContentResult is the **source data layer**; StructuredValue is the **wrapped form**.

- LoadContentResult is created by content loaders (files, URLs)
- StructuredValue is created by wrapping LoadContentResult (adds symbol, security metadata)
- No inheritance relationship; wrapping handles transformation
- `wrapLoadContentValue()` performs the conversion, including JSON/JSONL parsing

**Why**: LoadContentResult represents raw file data; StructuredValue adds runtime metadata and security context. They serve different purposes in different layers.

#### 3. End-State Semantics: Text vs Data for Different File Types

**Decision**: File type determines `.text` and `.data` semantics after wrapping.

**Text files (.txt, .md, etc.)**:
- `.text` = raw file content
- `.data` = raw file content (same as .text)
- File metadata via `.ctx.filename`, `.ctx.absolute`, etc.

**JSON files (.json)**:
- `.text` = raw file content (unparsed string)
- `.data` = parsed JSON object or array
- File metadata via `.ctx.filename`, `.ctx.absolute`, etc.

**JSONL files (.jsonl)**:
- `.text` = raw file content (unparsed lines)
- `.data` = parsed array of JSON objects
- File metadata via `.ctx.filename`, `.ctx.absolute`, etc.

**Why**: Preserves raw content for display while providing parsed data for computation. Both forms are accessible.

#### 4. Lazy Evaluation: Accept Eager Computation When Wrapping

**Decision**: Lazy getters on LoadContentResult are preserved, but wrapping triggers eager computation.

- LoadContentResult has lazy getters for `.tokest`, `.tokens`, `.fm`, `.json`
- `wrapLoadContentValue()` accesses these getters (triggers computation)
- Eager computation during wrapping is acceptable cost
- Lazy getters remain useful for code using LoadContentResult directly

**Why**: Wrapping happens at usage boundaries where computation is expected. Simplifies code vs preserving laziness through wrapper.

#### 5. Symbol Strategy: LoadContentResult Does NOT Gain STRUCTURED_VALUE_SYMBOL

**Decision**: Only StructuredValue wrappers have `STRUCTURED_VALUE_SYMBOL`.

- LoadContentResult remains a plain object/class without the symbol
- StructuredValue (from `wrapStructured()`) has the symbol
- `wrapLoadContentValue()` checks `isLoadContentResult()` BEFORE `isStructuredValue()`
- Prevents early return that would skip JSON/JSONL parsing

**Why**: Maintains clear distinction between source data and wrapped data. Ensures parsing and security extraction always happen.

### Migration Path

For code that needs to handle both LoadContentResult and StructuredValue:

```typescript
// In interpreter/ code - use helpers
import { isFileLoad, isFileLoadStructuredValue } from '@interpreter/utils/load-content-structured';

if (isFileLoad(value)) {
  // Handles both LoadContentResult and wrapped StructuredValue
}

// In core/ code - use structural guard
import { isLoadContentResult } from '@core/types/load-content';

if (isLoadContentResult(value)) {
  // Structural check only
}
```

### See Also

- `plan-loadcontent-to-structuredvalue.md` - Full implementation plan (GH#497)
- `interpreter/utils/load-content-structured.ts` - Wrapping implementation
- `core/types/load-content.ts` - Source interface

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

## Type Guards for File-Loaded Content

mlld provides three type guards for working with file-loaded content. Choose the appropriate one based on your layer and needs:

### Core Layer: `isLoadContentResult()`

**Location**: `core/types/load-content.ts`

**Checks**: Structural properties without symbols
```typescript
export function isLoadContentResult(value: unknown): value is LoadContentResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'content' in value &&
    'filename' in value &&
    'relative' in value &&
    'absolute' in value
  );
}
```

**Use in core/ code** that should not import from interpreter/:
```typescript
import { isLoadContentResult } from '@core/types/load-content';

if (isLoadContentResult(value)) {
  // Structural check only - no symbol checking
  console.log(value.filename);  // Safe in core
  console.log(value.content);   // Safe in core
}
```

**Why**: Maintains unidirectional dependency: `core/` → nothing, `interpreter/` → `core/`.

### Interpreter Layer: `isFileLoadStructuredValue()`

**Location**: `interpreter/utils/load-content-structured.ts`

**Checks**: Symbol-aware guard for wrapped file-loaded StructuredValues
```typescript
export function isFileLoadStructuredValue(value: unknown): value is StructuredValue {
  return isStructuredValue(value) && Boolean(value.ctx?.filename);
}
```

**Use in interpreter/ code** when you need a **wrapped** StructuredValue from file loading:
```typescript
import { isFileLoadStructuredValue } from '@interpreter/utils/load-content-structured';

if (isFileLoadStructuredValue(value)) {
  // It's wrapped and has file metadata
  const metadata = value.ctx;      // Canonical metadata access
  const content = value.text;      // Display-ready content
  const parsed = value.data;       // Parsed content (for JSON/JSONL)

  // Recommended for new code
  console.log(metadata.filename);
  console.log(metadata.tokens);
  console.log(metadata.fm);        // Frontmatter if present
}
```

**Why**: Only StructuredValues have the symbol; this guard verifies file metadata is available.

### Interpreter Layer: `isFileLoad()`

**Location**: `interpreter/utils/load-content-structured.ts`

**Checks**: Either unwrapped LoadContentResult or wrapped StructuredValue
```typescript
export function isFileLoad(value: unknown): boolean {
  return isLoadContentResult(value) || isFileLoadStructuredValue(value);
}
```

**Use in interpreter/ code** when you need to accept **both** forms (before and after wrapping):
```typescript
import { isFileLoad } from '@interpreter/utils/load-content-structured';

if (isFileLoad(value)) {
  // Handles unwrapped LoadContentResult OR wrapped StructuredValue
  // Useful during transitional phases or when the form is unknown
}
```

**Why**: Some code paths may encounter either form. Use when you don't care about the wrapper state.

### Accessing Metadata: Prefer `.ctx`

**Recommendation**: In new code, use `.ctx` for metadata access (available on StructuredValue):

```typescript
// Good - new code
const sv = value as StructuredValue;
console.log(sv.ctx.filename);      // Canonical path
console.log(sv.ctx.tokens);        // Token metrics
console.log(sv.ctx.relative);      // Relative path
console.log(sv.ctx.fm);            // Frontmatter (if present)
console.log(sv.ctx.tokest);        // Token estimate
```

Metadata fields available in `.ctx`:
- `filename`: Original filename
- `relative`: Relative path to project root
- `absolute`: Absolute file path
- `url`: URL (for remote content)
- `domain`: Domain name (for URLs)
- `title`: Page title (for HTML)
- `description`: Page description (for HTML)
- `tokens`: Exact token count (if computed)
- `tokest`: Estimated token count
- `fm`: Frontmatter object (if file has YAML/TOML frontmatter)
- `source`: Source type ('load-content', 'pipeline', etc.)
- `retries`: Number of retry attempts (if applicable)
- `labels`: Security labels
- `taint`: Taint tracking labels

### Summary: Which Guard to Use

| Context | Guard | Use | Reason |
|---------|-------|-----|--------|
| core/ code | `isLoadContentResult()` | Structural check | No symbol, maintains layering |
| interpreter/ with wrapped values | `isFileLoadStructuredValue()` | Symbol + metadata check | Verify wrapped & has metadata |
| interpreter/ either form | `isFileLoad()` | Accepts both | Transitional or ambiguous state |

**For new interpreter code**: Prefer `isFileLoadStructuredValue()` with `.ctx` metadata access—ensures wrapped form and provides full metadata surface.

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
