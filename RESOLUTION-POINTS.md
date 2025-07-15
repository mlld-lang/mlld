# Variable Resolution Points Analysis

This document maps all locations where we currently extract raw values from Variables, losing type information in the process.

## Core Resolution Functions

### 1. interpreter/core/interpreter.ts - `resolveVariableValue()`
**Purpose**: Central function that extracts values from Variables
**Current behavior**: Returns `variable.value` directly
**Used by**: Multiple evaluators and directives

Key usage patterns:
- Template interpolation
- Command execution
- Variable references in expressions

### 2. interpreter/eval/var.ts - Variable Creation
**Purpose**: Creates and resolves Variables
**Current behavior**: Mixed - sometimes preserves Variables, sometimes extracts
**Key functions**:
- `evaluateArrayItem()` - Evaluates array elements
- Complex object evaluation
- Run command results

### 3. interpreter/eval/show.ts - Output Formatting
**Purpose**: Formats Variables for display
**Current behavior**: Extracts value for string conversion
**Why**: Final output boundary - legitimate extraction point

### 4. interpreter/eval/output.ts - File/Stream Output
**Purpose**: Writes Variable content to files/streams
**Current behavior**: Extracts value for serialization
**Why**: External I/O boundary - legitimate extraction point

### 5. interpreter/eval/run.ts - Command Execution
**Purpose**: Executes shell commands with Variable arguments
**Current behavior**: Extracts string values for shell
**Why**: Shell interface boundary - legitimate extraction point

### 6. interpreter/eval/exec-invocation.ts - Exe Execution
**Purpose**: Invokes exe definitions with arguments
**Current behavior**: Resolves Variables to pass as arguments
**Consideration**: Could pass Variables to shadow environments

### 7. interpreter/eval/when.ts - Conditional Logic
**Purpose**: Evaluates conditions
**Current behavior**: Extracts values for truthiness checks
**Consideration**: Could use Variable metadata for type-aware comparisons

### 8. interpreter/eval/lazy-eval.ts - Template Evaluation
**Purpose**: Lazy evaluation of templates
**Current behavior**: Preserves some Variable info but extracts for final result
**Opportunity**: Keep Variables until final interpolation

### 9. interpreter/env/VariableManager.ts - Variable Storage
**Purpose**: Manages Variable storage and retrieval
**Current behavior**: Stores Variables correctly
**Good**: Already Variable-aware

### 10. interpreter/output/formatter.ts - Format Conversion
**Purpose**: Converts Variables to different output formats
**Current behavior**: Extracts value based on format needs
**Why**: Format conversion boundary - legitimate extraction

## Resolution Categories

### 1. Legitimate Extraction Points (Keep as-is)
- **Final output** (show.ts) - User needs to see actual values
- **File I/O** (output.ts) - Files need actual content
- **Shell commands** (run.ts) - Shell needs string arguments
- **Format conversion** (formatter.ts) - External formats need values

### 2. Unnecessary Extraction (Should preserve Variables)
- **Variable-to-variable assignment** - Keep Variable wrapper
- **Array/object members** - Store Variables, not values
- **Function arguments** (exe) - Pass Variables to functions
- **Import returns** - Return Variables from imports

### 3. Context-Dependent (Needs careful handling)
- **Template interpolation** - Preserve until final string build
- **Conditional evaluation** - Could use type-aware comparison
- **Pipeline stages** - Pass Variables through pipeline

## Key Patterns to Change

### Pattern 1: Early Resolution
```typescript
// Current - loses type info immediately
const value = resolveVariableValue(variable);
return processValue(value);

// Better - preserve Variable longer
const variable = resolveVariable(variable);
return processVariable(variable);
```

### Pattern 2: Array/Object Storage
```typescript
// Current - stores raw values
array.push(resolveVariableValue(item));

// Better - store Variables
array.push(item); // if item is Variable
```

### Pattern 3: Template Building
```typescript
// Current - extracts for each piece
parts.push(resolveVariableValue(var));

// Better - keep Variables, extract at end
parts.push(var);
// ... later ...
return parts.map(p => extractForOutput(p)).join('');
```

## Implementation Priority

1. **High Priority** (Core flow)
   - Update `resolveVariableValue()` to return Variables when possible
   - Update `evaluateArrayItem()` to preserve Variables
   - Update template interpolation to delay extraction

2. **Medium Priority** (Subsystems)
   - Update exe invocation to pass Variables
   - Update conditional evaluation for type awareness
   - Update pipeline to preserve Variables

3. **Low Priority** (Optimizations)
   - Add Variable-aware operations
   - Optimize Variable access patterns
   - Add debugging for Variable flow

## Testing Strategy

1. **Unit tests** for each updated function
2. **Integration tests** for Variable flow through systems
3. **Performance tests** to ensure no regression
4. **Edge case tests** for nested Variables, circular refs