# /when Directive - Architecture & Implementation

This document explains the internal architecture and implementation details of the /when directive in mlld.

## Overview

The /when directive provides conditional execution through a two-phase approach: grammar parsing into AST nodes, followed by interpretation/evaluation. The implementation is split across several key files.

## AST Structure

### Node Types

The /when directive produces two types of AST nodes:

1. **WhenSimpleNode**: For single-line conditionals
   ```typescript
   {
     kind: 'when',
     subtype: 'whenSimple',
     values: {
       condition: BaseMlldNode[],  // Condition expression nodes
       action: BaseMlldNode[]      // Action directive nodes
     }
   }
   ```

2. **WhenBlockNode**: For block-form conditionals
   ```typescript
   {
     kind: 'when',
     subtype: 'whenBlock',
     values: {
       variable?: BaseMlldNode[],    // Optional variable binding
       modifier: BaseMlldNode[],     // Text node with 'first' (alias)
       conditions: WhenConditionPair[], // Array of condition-action pairs
       action?: BaseMlldNode[]       // Optional block action
     },
     meta: {
       modifier: 'first' | 'default',
       conditionCount: number,
       hasVariable: boolean
     }
   }
   ```

3. **WhenExpression**: For value-returning when expressions
   ```typescript
   {
     kind: 'whenExpression',
     subtype: 'whenExpression',
     values: {
       conditions: WhenConditionPair[]  // Array of condition-expression pairs
     },
     meta: {
       isValueReturning: true,          // Distinguishes from directive /when
       withClause?: any                 // Optional pipeline modifiers
     }
   }
   ```

   Used in `/var` and `/exe` assignments:
   ```mlld
   /var @greeting = when: [
     @time < 12 => "Good morning"
     @time < 18 => "Good afternoon"
     true => "Good evening"
   ]
   ```

## Grammar Implementation

### Parser Rules (`grammar/directives/when.peggy`)

The grammar defines several key rules:

1. **SlashWhen**: Main entry point, delegates to simple or block form
2. **WhenSimpleForm**: Parses `/when <condition> => <action>`
3. **WhenBlockForm**: Parses `/when <var> <modifier>: [...] => <action>`
4. **WhenConditionExpression**: Accepts:
   - Expressions with operators (`@score > 90`, `@role == "admin"`)
   - CommandReference (`@command()` or `@command`)
   - VariableReference (`@variable`)
   - BinaryExpression (`@a && @b`, `@x || @y`)
   - UnaryExpression (`!@condition`)
   - TernaryExpression (in actions, not conditions)
   - Note: Direct `/run` is NOT supported by design

5. **WhenExpression**: For value-returning when expressions in RHS
   - Used in `VarRHSContent` and `ExeRHSContent`
   - Returns first matching value
   - Returns null if no match

### Operator Support

The grammar supports full expression evaluation in conditions:
- Comparison: `==`, `!=`, `>`, `<`, `>=`, `<=`
- Logical: `&&`, `||`, `!`
- Grouping: `()`
- Short-circuit evaluation for performance

## Interpreter Implementation

### Evaluation Flow (`interpreter/eval/when.ts`)

1. **Entry Point**: `evaluateWhen()`
   - Routes to appropriate handler based on subtype
   - Returns `EvalResult` with value and environment

2. **Simple Form**: `evaluateWhenSimple()`
   ```typescript
   // Pseudocode
   conditionResult = evaluateCondition(node.values.condition)
   if (conditionResult) {
     return evaluate(node.values.action)
   }
   return { value: '', env }
   ```

3. **Block Form**: `evaluateWhenBlock()`
   - Extracts modifier from meta
   - Routes to modifier-specific handler
   - Handles variable binding if present

### First-Match Behavior

#### `first` Modifier
- Evaluates conditions sequentially
- Executes action of first truthy condition
- Stops evaluation after first match
- Binds variable to condition output if specified

### Condition Evaluation

The `evaluateCondition()` function:

1. **Evaluates the condition nodes** using the main `evaluate()` function
2. **Checks for command execution**:
   - If `result.stdout` exists, it's a command result
   - Checks exit code (non-zero is false)
   - Uses stdout for truthiness check
3. **Falls back to value-based truthiness** for non-command results

### Truthiness Model

The `isTruthy()` function implements mlld's truthiness (different from JavaScript):

```typescript
function isTruthy(value: any): boolean {
  // Falsy values:
  if (value === false) return false;
  if (value === null || value === undefined) return false;
  if (value === '') return false;
  if (value === 0) return false;
  if (Array.isArray(value) && value.length === 0) return false;  // Empty arrays are falsy!
  if (typeof value === 'object' && Object.keys(value).length === 0) return false; // Empty objects are falsy!
  
  // Everything else is truthy
  return true;
}
```

Note: mlld's truthiness differs from JavaScript - empty arrays and objects are falsy in mlld.

## Command Execution Integration

### Variable References with Command Type

When a condition uses a command reference (e.g., `@is_true()`):

1. **Parser** creates a VariableReference node with `valueType: 'commandRef'`
2. **Interpreter** detects this in `evaluate()` for VariableReference nodes
3. **Command execution**:
   - Retrieves command definition from environment
   - Interpolates command template
   - Executes via `env.executeCommand()`
   - Returns result with stdout/stderr/exitCode

### Command Result Preservation

The interpreter's array evaluation preserves command execution metadata:

```typescript
// In evaluate() for arrays
let lastResult: EvalResult | null = null;

for (const n of node) {
  const result = await evaluate(n, env);
  lastResult = result;
  // ...
}

// Preserve stdout/stderr/exitCode if present
if (lastResult && (lastResult.stdout !== undefined || ...)) {
  return lastResult;
}
```

This ensures command execution results flow through to condition evaluation.

## Error Handling

### MlldConditionError

Custom error class for condition-specific failures:
- Extends MlldDirectiveError
- Includes modifier context
- Provides detailed command failure info

### Error Strategies by Modifier

- **simple/first**: Throws on first error

## Environment Integration

The @when evaluator creates child environments for block evaluation:
- Isolates variable bindings
- Prevents pollution of parent scope
- Automatic cleanup when block completes

## Performance Considerations

1. **Sequential Evaluation**: Conditions evaluate in order, not parallel
2. **Short-circuit Evaluation**: 'first' stops early when possible
3. **Memory**: Child environments for blocks add overhead
4. **Command Execution**: Each condition may spawn a process

## Testing Strategy

### Fixture Tests
- Located in `tests/cases/valid/when/`
- Cover all syntax forms and first-match behavior
- Test error scenarios in `tests/cases/exceptions/when/`

### Key Test Cases
1. **when-simple**: Basic conditional execution
2. **when-block-first**: First matching with variable binding
3. **when-variable-binding**: Variable capture from conditions

## WhenExpression Implementation

### Evaluation Flow (`interpreter/eval/when-expression.ts`)

WhenExpression nodes are evaluated differently from directive /when:

1. **First-match semantics**: Returns value of first matching condition
2. **Null on no match**: Returns null if no conditions are true
3. **Lazy evaluation**: For `/var`, creates a special variable type that re-evaluates on access
4. **Pipeline support**: Can have tail modifiers like `| @transform`

```typescript
// Example evaluation
/var @greeting = when: [
  @time < 12 => "Good morning"      // If true, returns "Good morning"
  @time < 18 => "Good afternoon"    // Only evaluated if first is false
  true => "Good evening"            // Default case
]
```

### Integration with /var and /exe

- `/var`: Creates a `WhenExpressionVariable` that re-evaluates on each access
- `/exe`: Evaluates immediately and stores the result

## Integration Points

The @when directive integrates with:
- **Command System**: Via @exec predefined commands
- **Variable System**: Through bindings and interpolation
- **Import System**: Conditions can be imported
- **Template System**: Actions can use templates
- **Error System**: Specialized error handling

## Design Philosophy

The @when implementation follows mlld's core principles:
- **Explicit over Implicit**: Named conditions vs inline expressions
- **Declarative**: Conditions are data, not code
- **Testable**: Each condition is independently executable
- **Composable**: Conditions and actions are just directives
- **Safe**: No arbitrary code execution in conditions
