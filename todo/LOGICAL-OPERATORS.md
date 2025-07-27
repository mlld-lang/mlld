# Logical Operators Implementation Spec for mlld

## Executive Summary

This document specifies the design and implementation plan for adding logical and comparison operators to mlld. The goal is to enable expressions like:

```mlld
/var @moduleSourceContent = @moduleSourceUrl ? <@moduleSourceUrl> : null
/when @reviewResult && !@reviewResult.error => /show "Review posted to GitHub"
/when @a || @b => /show "yes"
```

## Motivation

Currently, mlld relies entirely on function-based operations (e.g., `@eq(a, b)`, `@and(a, b)`) for comparisons and logical operations. While functional, this approach is verbose for common operations. Adding infix operators will make mlld more expressive and intuitive while maintaining backward compatibility.

## Design Principles

1. **Backward Compatibility**: All existing syntax must continue to work
2. **Semantic Consistency**: Operators follow mlld's existing type coercion rules
3. **Grammar-First**: Changes start in grammar abstractions, not individual directives
4. **Progressive Enhancement**: Start with core operators, expand based on usage
5. **Error Quality**: Maintain mlld's excellent error messages
6. **Focused Scope**: mlld is not for math - include only operators essential for logic and control flow

## Operator Specification

### Comparison Operators
- `==` - Equality (follows mlld's `compareValues` semantics)
- `!=` - Inequality  

### Logical Operators
- `&&` - Logical AND (short-circuits)
- `||` - Logical OR (short-circuits)
- `!` - Logical NOT (already exists)

### Ternary Operator
- `? :` - Conditional expression (e.g., `@a ? @b : @c`)

### Grouping
- `()` - Parentheses for explicit precedence

### Explicitly Excluded
- `<`, `>`, `<=`, `>=` - Not needed for mlld's use cases. Use inline JavaScript if math comparisons are needed.
- `+` - String concatenation (templates handle this)
- `??` - Null coalescing (ternary operator handles this use case)

## Type Coercion Rules

Operators will follow mlld's existing comparison semantics:

```mlld
# String-boolean comparison
"true" == true   # true
"false" == false # true

# String-number comparison  
"0" == 0        # true (if implemented)
"42" == 42      # true (if implemented)

# Null/undefined equality
null == undefined # true

# Truthiness (for boolean contexts)
# Empty arrays/objects are falsy (unlike JavaScript)
[] && true      # false
{} || false     # false
```

## Grammar Design

### 1. Expression Grammar Module

Create `grammar/patterns/expressions.peggy`:

```peggy
// EXPRESSION PATTERNS
// Provides infix operators for logical and comparison operations

// Top-level expression with ternary operator
Expression
  = condition:LogicalOr _ "?" _ trueBranch:Expression _ ":" _ falseBranch:Expression {
      return helpers.createNode('TernaryExpression', {
        condition,
        trueBranch,
        falseBranch,
        location: location()
      });
    }
  / LogicalOr

// Logical OR (lowest precedence binary operator)
LogicalOr
  = first:LogicalAnd rest:(_ "||" _ right:LogicalAnd { return { op: "||", right }; })* {
      return helpers.createBinaryExpression(first, rest);
    }

// Logical AND
LogicalAnd
  = first:Comparison rest:(_ "&&" _ right:Comparison { return { op: "&&", right }; })* {
      return helpers.createBinaryExpression(first, rest);
    }

// Comparison operators
Comparison
  = first:Primary rest:(_ op:ComparisonOp _ right:Primary { return { op, right }; })* {
      return helpers.createBinaryExpression(first, rest);
    }

ComparisonOp
  = "==" / "!="

// Primary expressions (highest precedence)
Primary
  = "(" _ expr:Expression _ ")" { return expr; }
  / UnaryExpression
  / AtomicExpression

// Unary expressions
UnaryExpression
  = "!" _ expr:Primary {
      return helpers.createNode('Negation', {
        condition: [expr],
        location: location()
      });
    }

// Atomic expressions (variables, literals, function calls)
AtomicExpression
  = VariableReference
  / ExecInvocation
  / Literal
```

### 2. Integration Points

#### Update When Directive

In `grammar/directives/when.peggy`:

```peggy
// Replace existing condition patterns with Expression
WhenSimpleCondition
  = expr:Expression {
      return [expr];
    }

WhenConditionExpression  
  = expr:Expression {
      return [expr];
    }
```

#### Update Variable Assignment

In `grammar/patterns/rhs.peggy`:

```peggy
// Add expression support to RHS patterns
VarRHSContent
  = TemplateContent
  / PathContent
  / Expression  // New: Allow expressions in assignments
  / /* existing patterns */
```

## Interpreter Implementation

### 1. Expression Evaluator

Create `interpreter/eval/expressions.ts`:

```typescript
import type { BaseMlldNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { evaluate } from '../core/interpreter';
import { compareValues, isTruthy } from './when';

export async function evaluateExpression(
  node: BaseMlldNode,
  env: Environment
): Promise<EvalResult> {
  switch (node.type) {
    case 'BinaryExpression':
      return evaluateBinaryExpression(node, env);
    case 'TernaryExpression':
      return evaluateTernaryExpression(node, env);
    case 'Negation':
      return evaluateNegation(node, env);
    default:
      // Fall back to regular evaluation
      return evaluate(node, env);
  }
}

async function evaluateBinaryExpression(
  node: any,
  env: Environment
): Promise<EvalResult> {
  const { operator, left, right } = node;
  
  // Handle short-circuit operators
  if (operator === '&&' || operator === '||') {
    const leftResult = await evaluate(left, env);
    const leftValue = await resolveValue(leftResult.value, env);
    const leftTruthy = isTruthy(leftValue);
    
    // Short-circuit evaluation
    if (operator === '&&' && !leftTruthy) {
      return { value: false, env };
    }
    if (operator === '||' && leftTruthy) {
      return { value: leftValue, env };
    }
    
    // Evaluate right side
    const rightResult = await evaluate(right, env);
    const rightValue = await resolveValue(rightResult.value, env);
    
    if (operator === '&&') {
      return { value: rightValue, env };
    } else { // ||
      return { value: rightValue, env };
    }
  }
  
  // Comparison operators - evaluate both sides
  const leftResult = await evaluate(left, env);
  const rightResult = await evaluate(right, env);
  const leftValue = await resolveValue(leftResult.value, env);
  const rightValue = await resolveValue(rightResult.value, env);
  
  switch (operator) {
    case '==':
      return { value: await compareValues(leftValue, rightValue, env), env };
    case '!=':
      return { value: !(await compareValues(leftValue, rightValue, env)), env };
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

async function evaluateTernaryExpression(
  node: any,
  env: Environment
): Promise<EvalResult> {
  const conditionResult = await evaluate(node.condition, env);
  const conditionValue = await resolveValue(conditionResult.value, env);
  
  if (isTruthy(conditionValue)) {
    return evaluate(node.trueBranch, env);
  } else {
    return evaluate(node.falseBranch, env);
  }
}
```

### 2. Update Main Interpreter

In `interpreter/core/interpreter.ts`, add expression handling:

```typescript
case 'BinaryExpression':
case 'TernaryExpression':
  const { evaluateExpression } = await import('../eval/expressions');
  return evaluateExpression(node, env);
```

### 3. Update When Evaluator

The existing `evaluateCondition` function needs minimal changes since it already handles node arrays. The expression nodes will be evaluated naturally through the interpreter.

## Integration Strategy

### Phase 1: Core Implementation (2-3 days)
1. Create expression grammar module
2. Add helper functions for AST node creation
3. Implement expression evaluator
4. Update main interpreter
5. Write comprehensive tests

### Phase 2: Directive Integration (1-2 days)
1. Update when directive grammar
2. Update variable assignment grammar
3. Test with existing test suite
4. Fix any edge cases

### Phase 3: Error Handling (1 day)
1. Add expression-specific error types
2. Implement helpful error messages
3. Add parser error recovery

### Phase 4: Documentation (1 day)
1. Update language documentation
2. Add examples to test cases
3. Update AST documentation

## Testing Strategy

### Grammar Tests
```bash
npm run ast -- '/when @a && @b => /show "yes"'
npm run ast -- '/var @result = @a > 10 ? "big" : "small"'
```

### Integration Tests
Create test cases in `tests/cases/expressions/`:
- `logical-operators.md`
- `comparison-operators.md`
- `ternary-operator.md`
- `operator-precedence.md`
- `type-coercion.md`

### Edge Cases
- Operator precedence
- Type coercion edge cases
- Short-circuit behavior
- Error conditions
- Parentheses grouping

## Migration Guide

### For Users
```mlld
# Before
/when @and(@a, @b) => /show "Both true"
/var @result = @exists(@value) ? @value : 'default'

# After  
/when @a && @b => /show "Both true"
/var @result = @value ? @value : 'default'

# Both syntaxes remain valid!
```

### For Module Authors
Existing comparison and logical functions remain available and useful for:
- Complex multi-argument operations
- Functional programming patterns
- Backward compatibility

## Risks and Mitigations

### Risk 1: Grammar Conflicts
**Risk**: Minimal - no `<`/`>` operators means no conflict with file reference syntax `<@file>`
**Mitigation**: Carefully order grammar rules, use predicates where needed

### Risk 2: Breaking Changes
**Risk**: Low - all existing function syntax (`@eq()`, `@and()`) remains unchanged
**Mitigation**: Extensive testing, maintain all existing patterns

### Risk 3: Performance Impact
**Risk**: Negligible - operators compile to same evaluation logic as functions
**Mitigation**: Short-circuit evaluation, efficient AST structure

### Risk 4: Confusion with Existing Functions
**Risk**: Users might be unsure when to use operators vs functions
**Mitigation**: Clear documentation showing both approaches, emphasize operators for common cases

## Success Criteria

1. All operators work as specified
2. No existing tests break
3. Error messages remain helpful
4. Performance impact < 5%
5. Documentation is clear and complete

## Future Extensions

Once core operators are stable, consider:
1. Array/object membership (`in`)
2. Optional chaining (`?.`) - though mlld's field access is already forgiving

## Implementation Checklist

- [ ] Create `grammar/patterns/expressions.peggy`
- [ ] Add AST node types for expressions
- [ ] Update grammar helper functions
- [ ] Implement expression evaluator
- [ ] Update main interpreter
- [ ] Integrate with when directive
- [ ] Integrate with variable assignments
- [ ] Add expression error types
- [ ] Implement error recovery
- [ ] Write comprehensive tests
- [ ] Update documentation
- [ ] Performance testing
- [ ] Migration guide
- [ ] Release notes