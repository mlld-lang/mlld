# @when Directive - Architecture & Implementation

This document explains the internal architecture and implementation details of the @when directive in mlld.

## Overview

The @when directive provides conditional execution through a two-phase approach: grammar parsing into AST nodes, followed by interpretation/evaluation. The implementation is split across several key files.

## AST Structure

### Node Types

The @when directive produces two types of AST nodes:

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
       modifier: BaseMlldNode[],     // Text node with 'first'|'all'|'any'
       conditions: WhenConditionPair[], // Array of condition-action pairs
       action?: BaseMlldNode[]       // Optional block action (for 'any')
     },
     meta: {
       modifier: 'first' | 'all' | 'any',
       conditionCount: number,
       hasVariable: boolean
     }
   }
   ```

## Grammar Implementation

### Parser Rules (`grammar/directives/when.peggy`)

The grammar defines several key rules:

1. **AtWhen**: Main entry point, delegates to simple or block form
2. **WhenSimpleForm**: Parses `@when <condition> => <action>`
3. **WhenBlockForm**: Parses `@when <var> <modifier>: [...] => <action>`
4. **WhenConditionExpression**: Accepts only:
   - CommandReference (`@command()` or `@command`)
   - VariableReference (`@variable`)
   - Note: Direct `@run` is NOT supported by design

### Key Design Decision: No Direct @run

The grammar intentionally restricts conditions to predefined commands. This ensures:
- Conditions are named and reusable
- Better testability
- Clearer intent in scripts
- Consistent with mlld's declarative philosophy

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

### Modifier Implementations

#### `first` Modifier
- Evaluates conditions sequentially
- Executes action of first truthy condition
- Stops evaluation after first match
- Binds variable to condition output if specified

#### `all` Modifier
- Evaluates all conditions
- Executes actions for all truthy conditions
- Concatenates outputs with newlines
- Throws aggregated error if all fail

#### `any` Modifier
- Evaluates all conditions
- If any is truthy, executes block action
- Logs warnings for failed conditions
- Returns empty if no conditions match

### Condition Evaluation

The `evaluateCondition()` function:

1. **Evaluates the condition nodes** using the main `evaluate()` function
2. **Checks for command execution**:
   - If `result.stdout` exists, it's a command result
   - Checks exit code (non-zero is false)
   - Uses stdout for truthiness check
3. **Falls back to value-based truthiness** for non-command results

### Truthiness Model

The `isTruthy()` function implements mlld's truthiness:

```typescript
function isTruthy(value: any): boolean {
  // Falsy: null, undefined
  if (value === null || value === undefined) return false;
  
  // String truthiness
  if (typeof value === 'string') {
    if (value === '') return false;                    // Empty
    if (value.toLowerCase() === 'false') return false; // "false"
    if (value === '0') return false;                   // "0"
    return true;                                        // All others
  }
  
  // Number: 0 and NaN are false
  // Array: empty is false
  // Object: empty is false
  // Default: true
}
```

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

### Key Fix for Command Results

The interpreter's array evaluation was updated to preserve command execution metadata:

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
- Supports error aggregation for 'all' modifier
- Provides detailed command failure info

### Error Strategies by Modifier

- **simple/first**: Throws on first error
- **all**: Aggregates all errors, throws summary
- **any**: Logs warnings, continues evaluation

## Environment Integration

The @when evaluator creates child environments for block evaluation:
- Isolates variable bindings
- Prevents pollution of parent scope
- Automatic cleanup when block completes

## Performance Considerations

1. **Sequential Evaluation**: Conditions evaluate in order, not parallel
2. **Short-circuit Evaluation**: 'first' and 'any' stop early when possible
3. **Memory**: Child environments for blocks add overhead
4. **Command Execution**: Each condition may spawn a process

## Testing Strategy

### Fixture Tests
- Located in `tests/cases/valid/when/`
- Cover all syntax forms and modifiers
- Test error scenarios in `tests/cases/exceptions/when/`

### Key Test Cases
1. **when-simple**: Basic conditional execution
2. **when-block-first**: First matching with variable binding
3. **when-block-all**: Multiple action execution
4. **when-block-any**: Combined condition checking
5. **when-variable-binding**: Variable capture from conditions

## Future Enhancements

1. **Direct @run Support**: Could be added by updating grammar
2. **Parallel Evaluation**: For 'all' and 'any' modifiers
3. **Condition Caching**: Avoid re-executing identical conditions
4. **Boolean Operators**: AND/OR/NOT in condition expressions
5. **Else Clause**: Default action when no conditions match

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