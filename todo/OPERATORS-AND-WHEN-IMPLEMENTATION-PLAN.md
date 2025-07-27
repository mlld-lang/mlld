# mlld Operators and When Enhancements Implementation Plan

## Overview

This document outlines the implementation plan for three major enhancements to mlld:
1. **Logical Operators** - Adding infix operators (&&, ||, ==, !=, ?, :, !)
2. **Implicit When Actions** - Simplified syntax within /when blocks
3. **RHS When Expressions** - Using `when:` as a value-returning expression

## Critical Design Principle: Grammar-Type Synchronization

**The grammar and TypeScript types must remain 100% synchronized.** Any grammar change requires corresponding type updates BEFORE implementation.

## Progress Summary

- ✅ **Phase 0**: Type system updates completed
- ✅ **Phase 1**: Expression grammar created, helper functions added
- 🚧 **Phase 2**: When integration attempted but reverted
- 🔴 **Phases 3-6**: Not yet started

## Key File Locations

- **Grammar source**: `grammar/deps/grammar-core.ts` (NOT .js - this is TypeScript!)
- **Expression grammar**: `grammar/patterns/expressions.peggy` ✅ Created
- **Type definitions**: `core/types/primitives.ts` ✅ Updated
- **Helper functions**: `grammar/deps/grammar-core.ts` ✅ Added createBinaryExpression
- **When directive**: `grammar/directives/when.peggy` ❌ Changes reverted

## Critical Lessons Learned

### Pattern Ordering in PEG is CRITICAL
- **Problem**: Agent added `Expression` as FIRST choice in `VarRHSContent`
- **Result**: 147 test failures! Everything was being parsed as Expression
- **Solution**: Moved `Expression` to LAST position in pattern list
- **Lesson**: In PEG parsers, more specific patterns MUST come before general ones

### Current Test Status
- Started with: 147 failures
- After fix: Only 2 failures (expected - features not complete)
- Key insight: Small grammar ordering changes can have massive impacts

## 1. Logical Operators Implementation

### 1.1 Specification

Add the following operators to mlld:
- **Comparison**: `==`, `!=`, `<`, `>`, `<=`, `>=` (essential for token counting!)
- **Logical**: `&&`, `||` (with short-circuit evaluation)
- **Unary**: `!` (already exists, needs integration)
- **Ternary**: `? :` (conditional expression)
- **Grouping**: `()` (explicit precedence)

**Explicitly excluded**: `+`, `-`, `*`, `/`, `%`, `??` (arithmetic not needed)

### 1.2 Type System Updates (Phase 0)

Before any grammar changes, update the type system:

```typescript
// In core/types/nodes.ts

export interface BinaryExpression extends BaseNode {
  type: 'BinaryExpression';
  operator: '&&' | '||' | '==' | '!=';
  left: Expression;
  right: Expression;
}

export interface TernaryExpression extends BaseNode {
  type: 'TernaryExpression';
  condition: Expression;
  trueBranch: Expression;
  falseBranch: Expression;
}

export interface UnaryExpression extends BaseNode {
  type: 'UnaryExpression';
  operator: '!';
  operand: Expression;
}

// Update NodeType enum
export enum NodeType {
  // ... existing types ...
  BinaryExpression = 'BinaryExpression',
  TernaryExpression = 'TernaryExpression',
  UnaryExpression = 'UnaryExpression',
}

// Type guards
export function isBinaryExpression(node: any): node is BinaryExpression {
  return node?.type === 'BinaryExpression';
}

export function isTernaryExpression(node: any): node is TernaryExpression {
  return node?.type === 'TernaryExpression';
}

export function isUnaryExpression(node: any): node is UnaryExpression {
  return node?.type === 'UnaryExpression';
}
```

### 1.3 Helper Functions

Add to `grammar/deps/grammar-core.js`:

```javascript
// Binary expression builder with left-to-right associativity
createBinaryExpression(first, rest, location) {
  if (!rest || rest.length === 0) return first;
  
  return rest.reduce((left, {op, right}) => 
    this.createNode('BinaryExpression', {
      operator: op,
      left,
      right,
      location
    }), first);
},

// Check if nodes contain newlines
containsNewline(nodes) {
  if (!Array.isArray(nodes)) nodes = [nodes];
  return nodes.some(n => 
    n.type === 'Newline' || 
    (n.content && n.content.includes('\n')) ||
    (n.raw && n.raw.includes('\n'))
  );
},

// Reconstruct raw string from AST nodes
reconstructRawString(nodes) {
  if (!Array.isArray(nodes)) nodes = [nodes];
  return nodes.map(n => n.raw || n.content || '').join('');
}
```

### 1.4 Grammar Implementation

Create `grammar/patterns/expressions.peggy`:

```peggy
// EXPRESSION PATTERNS
// Provides infix operators for logical and comparison operations
// Used by: when directive conditions, var assignments
// Precedence (lowest to highest): Ternary → OR → AND → Comparison → Unary → Primary

// Top-level expression with ternary operator (lowest precedence)
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

// Logical OR (left-associative)
LogicalOr
  = first:LogicalAnd rest:(_ "||" _ right:LogicalAnd { return { op: "||", right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
    }

// Logical AND (left-associative)
LogicalAnd
  = first:Comparison rest:(_ "&&" _ right:Comparison { return { op: "&&", right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
    }

// Comparison operators (left-associative)
Comparison
  = first:Primary rest:(_ op:ComparisonOp _ right:Primary { return { op, right }; })* {
      return helpers.createBinaryExpression(first, rest, location());
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
      return helpers.createNode('UnaryExpression', {
        operator: '!',
        operand: expr,
        location: location()
      });
    }

// Atomic expressions - simplified to reuse existing patterns
AtomicExpression
  = UnifiedReference  // Handles @var, @func(), @obj.method() with tail modifiers
  / LiteralValue      // Reuses existing literal patterns from base

// Error recovery for common mistakes
/ "(" _ expr:Expression _ &{
    const rest = input.substring(peg$currPos);
    return !rest.includes(')');
  } {
    error("Unclosed parenthesis in expression. Expected ')'");
  }
```

### 1.5 Integration with When Directive

Update `directives/when.peggy`:

```peggy
// Replace existing condition patterns
WhenConditionExpression
  = Expression              // New expression with operators
  / NegatedCondition       // Keep existing pattern for backward compatibility
  / NonNegatedCondition    // Keep existing pattern for backward compatibility

WhenSimpleCondition
  = expr:Expression {
      // Wrap in array for consistency with existing code
      return [expr];
    }
```

### 1.6 Type Coercion

Operators follow mlld's existing comparison semantics:
- `"true" == true` → true
- `"false" == false` → true
- `null == undefined` → true
- Empty arrays/objects are falsy (unlike JavaScript)

## 2. Implicit When Actions

### 2.1 Specification

Allow simplified syntax within /when blocks by making the directive prefix optional:

```mlld
# Before (explicit)
/when @condition => /var @x = "value"
/when @condition => /exe @func() = @helper()
/when @condition => /run @doSomething()

# After (implicit)
/when @condition => @x = "value"
/when @condition => @func() = @helper()
/when @condition => @doSomething()
```

### 2.2 Constraints

Due to whitespace sensitivity in when blocks:
- **Single-line only** - No multi-line templates, code blocks, or commands
- **Routing focus** - Executable definitions can only alias/route to existing functions
- **No complex definitions** - Define complex logic elsewhere, reference it in when blocks

### 2.3 Allowed Patterns

#### Variable Assignment
```mlld
/when @condition => @x = 'literal'                    # Single quotes (no interpolation)
/when @condition => @x = "text with @var"             # Double quotes (@var interpolation)
/when @condition => @x = `text with @var`             # Backticks (@var interpolation)
/when @condition => @x = :::text with {{var}}:::      # Triple colon ({{var}} interpolation)
/when @condition => @x = @func() | @transform         # With tail modifiers
```

#### Executable Definition (Routing Only)
```mlld
/when @condition => @newfunc(args) = @oldfunc(args)   # Simple aliasing
/when @condition => @func() = @helper() | @transform  # With tail modifiers
/when @condition => @func() = ::template::            # Template return
/when @condition => @func() = "literal"               # Literal return
```

**NOT allowed**:
- `@func() = js {...}` - No code blocks
- `@func() = {command}` - No command syntax
- `@func() = run "cmd"` - No run syntax

#### Pure Execution
```mlld
/when @condition => @doSomething()                    # Execute function
/when @condition => @process() | @handleResult        # With tail modifiers
/when @condition => @compute() with { timeout: 5000 } # With options
```

### 2.4 Grammar Implementation

Update `directives/when.peggy` to add implicit actions:

```peggy
// Update WhenAction to include implicit actions
WhenAction
  = WhenActionBlock
  / WhenActionDirective
  / WhenActionImplicit      // New!

// Implicit actions (no leading /)
WhenActionImplicit
  = ImplicitVarAssignment
  / ImplicitExeDefinition
  / ImplicitExecution

// Variable assignment: @var = value (single-line only)
ImplicitVarAssignment
  = "@" id:BaseIdentifier _ "=" _ value:ConstrainedVarRHS {
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      // Check for newlines
      if (helpers.containsNewline(value)) {
        error(
          'Multi-line content is not allowed in /when action blocks.\n' +
          '💡 For multi-line content, use a separate /var directive:\n' +
          '   /var @template = `\n' +
          '     multi-line\n' +
          '     content\n' +
          '   `\n' +
          '   /when @condition => @result = @template'
        );
      }
      
      // Process value based on structure (same as /var)
      let processedValue;
      let metaInfo = { implicit: true };
      
      if (value && value.content && value.wrapperType) {
        processedValue = value.content;
        metaInfo.wrapperType = value.wrapperType;
        metaInfo.inferredType = 'template';
      } else if (value && typeof value === 'object') {
        processedValue = Array.isArray(value) ? value : [value];
        metaInfo.inferredType = value.type || 'value';
      } else {
        processedValue = [helpers.createNode(NodeType.Text, { 
          content: String(value), 
          location: location() 
        })];
        metaInfo.inferredType = 'text';
      }
      
      return [helpers.createNode(NodeType.Directive, {
        kind: 'var',
        subtype: 'var',
        values: { 
          identifier: [idNode],
          value: processedValue
        },
        raw: {
          identifier: id,
          value: helpers.reconstructRawString(processedValue)
        },
        meta: metaInfo,
        location: location()
      })];
    }

// Executable definition: @func(params) = implementation (routing only)
ImplicitExeDefinition
  = "@" id:BaseIdentifier params:ExecParameters _ "=" _ impl:ConstrainedExeImpl {
      const idNode = helpers.createVariableReferenceNode('identifier', { identifier: id });
      
      if (helpers.containsNewline(impl)) {
        error(
          'Multi-line implementations are not allowed in /when action blocks.\n' +
          '💡 Define complex executables separately:\n' +
          '   /exe @complexFunc() = js {\n' +
          '     // multi-line code\n' +
          '   }\n' +
          '   /when @condition => @result = @complexFunc()'
        );
      }
      
      return [helpers.createNode(NodeType.Directive, {
        kind: 'exe',
        subtype: 'exeReference',  // Always routing/aliasing
        values: {
          identifier: [idNode],
          parameters: params,
          implementation: impl
        },
        raw: {
          identifier: id,
          parameters: helpers.reconstructRawString(params),
          implementation: helpers.reconstructRawString(impl)
        },
        meta: {
          implicit: true,
          hasParameters: params.length > 0,
          parameterCount: params.length
        },
        location: location()
      })];
    }

// Pure execution: @function()
ImplicitExecution
  = ref:UnifiedReferenceWithTail {
      const isExec = ref.type === 'ExecInvocation';
      
      return [helpers.createNode(NodeType.Directive, {
        kind: 'run',
        subtype: isExec ? 'runExecReference' : 'runVariable',
        values: {
          [isExec ? 'execInvocation' : 'variable']: ref
        },
        raw: {
          [isExec ? 'execInvocation' : 'variable']: helpers.reconstructRawString(ref)
        },
        meta: {
          implicit: true,
          isExecution: true
        },
        location: location()
      })];
    }

// Constrained patterns for single-line content
ConstrainedVarRHS
  = SingleLineTemplate
  / UnifiedReferenceWithTail  // @func() calls
  / PrimitiveValue            // true, false, null, numbers
  // NO multi-line patterns, NO when: expressions

ConstrainedExeImpl
  = "@" ref:UnifiedReferenceWithTail { return ref; }  // Routing to existing function
  / SingleLineTemplate                                 // Template return value
  // NO code blocks, NO commands

// Single-line template patterns with all quote types
SingleLineTemplate
  = SingleLineBacktickTemplate
  / SingleLineDoubleQuoteTemplate
  / SingleLineSingleQuoteTemplate
  / SingleLineDoubleColonTemplate
  / SingleLineTripleColonTemplate

// Each template type checks for newlines
SingleLineBacktickTemplate
  = "`" parts:BacktickPart* "`" &{
      return !helpers.containsNewline(parts);
    } {
      return {
        content: parts,
        wrapperType: 'backtick'
      };
    }

// Similar patterns for other quote types...
```

### 2.5 Error Recovery

Add specific error patterns for common mistakes:

```peggy
// Error: Multi-line in when action
/ "@" id:BaseIdentifier _ "=" _ &{
    const rest = input.substring(peg$currPos);
    return rest.includes('\n') && !rest.startsWith('when:');
  } {
    error(
      `Multi-line content detected in /when action block.\n` +
      `When actions must be single-line for clarity.\n` +
      `💡 Define multi-line content separately and reference it.`
    );
  }

// Error: Code block attempt
/ "@" id:BaseIdentifier params:ExecParameters? _ "=" _ lang:("js" / "python" / "bash") _ "{" {
    error(
      `Code blocks are not allowed in /when action blocks.\n` +
      `💡 Define executables with code separately:\n` +
      `   /exe @${id}() = ${lang} { /* code */ }\n` +
      `   /when @condition => @result = @${id}()`
    );
  }
```

## 3. RHS When Expressions

### 3.1 Specification

Allow `when:` as a value-returning expression in var/exe assignments:

```mlld
/var @greeting = when: [
  @time.hour < 12 => "Good morning"
  @time.hour < 18 => "Good afternoon"
  true => "Good evening"
]

/exe @processData(type, data) = when: [
  @type == "json" => @jsonProcessor(@data)
  @type == "xml" => @xmlProcessor(@data)
  true => @genericProcessor(@data)
]
```

### 3.2 Semantics

- **Expression context** - Returns a value, not a side effect
- **First match** - Like `/when first:`, stops at first true condition
- **No match** - Returns `null` if no conditions match
- **Full tail support** - All modifiers work: `| @transform`, `trust always`, `with {...}`

### 3.3 Grammar Implementation

Add to `patterns/var-rhs.peggy`:

```peggy
// When expression for RHS contexts
WhenExpression
  = "when" _ ":" _ "[" _ conditions:WhenExpressionConditionList _ "]" tail:TailModifiers? {
      return {
        type: 'whenExpression',
        conditions: conditions,
        withClause: tail || null
      };
    }
```

## 4. Implementation Phases

### Phase 0: Type System Updates (Day 1) ✅ COMPLETED
1. ✅ Update NodeType enum in `core/shared/types.ts` (added BinaryExpression, TernaryExpression, UnaryExpression)
2. ✅ Create TypeScript interfaces for new expression nodes (in `primitives.ts`)
3. ✅ Add type guards for expression types (in `guards.ts`)
4. ✅ Update union types to include new nodes

### Phase 1: Grammar Foundation (Days 2-3) ✅ COMPLETED
1. ✅ Add helper functions to `grammar-core.ts`
   - ✅ `createBinaryExpression` with left-associativity
   - 🔴 `containsNewline` for single-line validation (still needed)
   - ✅ `reconstructRawString` (already exists)
2. ✅ Create `expressions.peggy` with operators
3. ✅ Expression pattern added to var-rhs.peggy (as LAST choice!)
4. 🔴 Validate operator precedence and associativity with tests

### Phase 2: When Integration (Days 4-5) 🔴 NEEDS RESTART
1. ❌ Update when conditions to use Expression pattern (changes were reverted)
2. 🔴 Implement single-line constrained patterns for implicit actions
3. 🔴 Add error recovery for common mistakes
4. 🔴 Ensure AST consistency with explicit directives
5. ✅ Verify backward compatibility (confirmed - only 2 tests failing)

### Phase 3: RHS When Expression (Day 6) 🔴 NOT STARTED
1. 🔴 Add WhenExpression to var-rhs.peggy
2. 🔴 Support in exe.peggy for executable definitions
3. 🔴 Ensure tail modifier support
4. 🔴 Test with complex routing scenarios

### Phase 4: Interpreter Implementation (Days 7-8) 🔴 NOT STARTED
1. 🔴 Create expression evaluator with short-circuit logic
2. 🔴 Update main interpreter to handle new node types
3. 🔴 Implement when expression evaluation
4. 🔴 Add type coercion for operators
5. 🔴 Handle error propagation

#### Detailed Implementation Guide

**Location**: `interpreter/interpreter.ts` in the `evaluate()` function

**Required Imports**:
```typescript
import { 
  BinaryExpression, 
  TernaryExpression, 
  UnaryExpression 
} from '@core/types/primitives';

// Check if these exist in interpreter/eval/expression.ts or when.ts
// If not, implement them according to the rules below
import { isTruthy, isEqual, toNumber } from './eval/expression';
```

**Add new cases for expression nodes**:
```typescript
case 'BinaryExpression':
  return evaluateBinaryExpression(node, env);
  
case 'TernaryExpression':
  return evaluateTernaryExpression(node, env);
  
case 'UnaryExpression':
  return evaluateUnaryExpression(node, env);
```

**Binary Expression Evaluator**:
```typescript
async function evaluateBinaryExpression(node: BinaryExpression, env: Environment): Promise<any> {
  switch (node.operator) {
    case '&&': {
      // Short-circuit: if left is falsy, return left
      const left = await evaluate(node.left, env);
      if (!isTruthy(left)) return left;
      return await evaluate(node.right, env);
    }
    
    case '||': {
      // Short-circuit: if left is truthy, return left
      const left = await evaluate(node.left, env);
      if (isTruthy(left)) return left;
      return await evaluate(node.right, env);
    }
    
    case '==': {
      const left = await evaluate(node.left, env);
      const right = await evaluate(node.right, env);
      return isEqual(left, right);
    }
    
    case '!=': {
      const left = await evaluate(node.left, env);
      const right = await evaluate(node.right, env);
      return !isEqual(left, right);
    }
    
    case '<': {
      const left = await evaluate(node.left, env);
      const right = await evaluate(node.right, env);
      return toNumber(left) < toNumber(right);
    }
    
    // Similar for '>', '<=', '>='
  }
}
```

**Type Coercion Rules**:

1. **Truthiness** (`isTruthy`):
   - `false`, `null`, `undefined`, `""`, `0` → false
   - Empty arrays `[]` → false (unlike JavaScript!)
   - Empty objects `{}` → false (unlike JavaScript!)
   - Everything else → true

2. **Equality** (`isEqual`):
   - `"true" == true` → true (string "true" equals boolean)
   - `"false" == false` → true
   - `null == undefined` → true
   - Numbers compared numerically: `"5" == 5` → true
   - Otherwise use JavaScript's `===`

3. **Numeric Comparison** (`toNumber`):
   - Parse strings to numbers
   - `true` → 1, `false` → 0
   - `null` → 0, `undefined` → NaN
   - Non-numeric strings → NaN

**Ternary Expression**:
```typescript
async function evaluateTernaryExpression(node: TernaryExpression, env: Environment): Promise<any> {
  const condition = await evaluate(node.condition, env);
  if (isTruthy(condition)) {
    return await evaluate(node.trueBranch, env);
  } else {
    return await evaluate(node.falseBranch, env);
  }
}
```

**Unary Expression**:
```typescript
async function evaluateUnaryExpression(node: UnaryExpression, env: Environment): Promise<any> {
  const operand = await evaluate(node.operand, env);
  if (node.operator === '!') {
    return !isTruthy(operand);
  }
  throw new Error(`Unknown unary operator: ${node.operator}`);
}
```

### Phase 5: Testing & Validation (Day 9)
1. Comprehensive test cases for all features
2. AST validation for all new patterns
3. Performance benchmarking
4. Edge case testing

### Phase 6: Documentation & Polish (Day 10)
1. Update language documentation
2. Create migration guide
3. Add examples to test cases
4. Final code review

## 5. Current Working State

### Critical Notes for Implementers

1. **Expression grammar EXISTS** - `expressions.peggy` has all operators
2. **Types are DONE** - All AST node types exist in `core/types/primitives.ts`
3. **Working in /var** - Expressions parse correctly in variable assignments
4. **NOT in /when yet** - Need to update `when.peggy` to use Expression pattern
5. **Interpreter needs work** - No evaluation logic exists yet
6. **Integration approach** - Uses `ExpressionWithOperator` with lookahead in `var-rhs.peggy`

### What Works Now
- ✅ Expression parsing in variable assignments: `/var @result = @a && @b || @c`
- ✅ All operators parse correctly: `&&`, `||`, `==`, `!=`, `?`, `:`, `!`
- ✅ Complex expressions with proper precedence: `@a && @b || @c` → `((@a && @b) || @c)`
- ✅ Ternary expressions: `/var @x = @test ? @true : @false`
- ✅ Comparison operators: `/var @match = @x == "test"`
- ✅ Type system fully updated with new expression node types
- ✅ Parser builds successfully with expressions.peggy included
- ✅ Smart integration with VarRHSContent using lookahead for operators

### Integration Solution
- **Problem**: Simple pattern ordering didn't work - other patterns consumed variables
- **Solution**: Created `ExpressionWithOperator` that uses lookahead to detect operators
- **Result**: Expressions only match when operators are present, avoiding conflicts

### What Doesn't Work Yet
- ❌ Expressions in /when conditions (e.g., `/when @a && @b => action`)
- ❌ Implicit when actions (e.g., `/when @cond => @x = value`)
- ❌ RHS when expressions (e.g., `/var @x = when: [...]`)
- ❌ Expression evaluation in interpreter
- ❌ Type coercion for operators

### Remaining Test Failures
1. `expressions-operators` - Parse error (expected - when integration not done)
2. `when-exe-in-when-block-action` - Related to when block changes

## 6. Key Design Decisions

### Semantic Operator Usage

#### Recommended Patterns
1. **In `/var` assignments**:
   - ✅ Equality: `/var @isMatch = @a == @b` (returns boolean)
   - ✅ Inequality: `/var @isDifferent = @a != @b` (returns boolean)
   - ✅ Numeric comparison: `/var @isOverLimit = @tokens > 1000` (essential for token counting!)
   - ✅ Ternary: `/var @config = @isDev ? "dev.json" : "prod.json"`
   - ✅ Default values: `/var @setting = @userSetting || @defaultSetting`
   - ⚠️ Logical AND: `/var @result = @a && @b` (works but confusing - avoid)

2. **In `/when` conditions** (ALL operators make sense):
   - ✅ `/when @a && @b => action` - Both must be true
   - ✅ `/when @a || @b => action` - Either must be true
   - ✅ `/when @a == @b => action` - Must be equal
   - ✅ `/when @a != @b => action` - Must not be equal
   - ✅ `/when @tokens > 1000 => action` - Numeric comparison
   - ✅ `/when @count >= @limit => action` - Greater than or equal
   - ✅ `/when !@a => action` - Must be false/falsy
   - ✅ Chaining: `/when @a && @b && @c && @d => action`
   - ✅ Mixed: `/when @tokens > 500 && @tokens < 2000 => action`

### Why These Constraints?

1. **Single-line only in when blocks** - Maintains readability and clear intent
2. **No code definitions in when** - `/when` is for routing, not defining new logic
3. **Limited operators** - mlld is not for math, just logic and routing
4. **Implicit syntax** - Reduces visual noise while maintaining clarity
5. **Semantic clarity** - Operators should have clear, intuitive meaning in context

### Grammar Architecture

- **Abstraction-first** - New patterns compose with existing ones
- **Consistent AST** - Implicit directives produce same structure as explicit
- **Error quality** - Helpful messages guide users to best practices
- **Reuse patterns** - Leverage `UnifiedReferenceWithTail`, `TailModifiers`, etc.

## 6. Testing Strategy

### AST Validation Tests
```bash
# Operators - verify AST structure
npm run ast -- '/var @result = @a && @b || @c'
npm run ast -- '/var @val = @x == "test" ? @y : @z'
npm run ast -- '/when !@isDev && @isProd => @deploy()'

# Implicit actions - verify same AST as explicit
npm run ast -- '/when @prod => @config = @prodConfig'
npm run ast -- '/when @dev => @setup() = @devSetup()'
npm run ast -- '/when @test => @run() | @validate | @report'

# RHS when - verify expression nodes
npm run ast -- '/var @msg = when: [@isError => "Error", true => "OK"]'
npm run ast -- '/exe @route(type) = when: [@type == "A" => @handleA, @type == "B" => @handleB]'
```

### Grammar Test Cases
Create test files in `tests/cases/expressions/`:

#### `operator-precedence.md`
```mlld
# Test operator precedence
/var @result1 = @a || @b && @c        # Should parse as @a || (@b && @c)
/var @result2 = @a && @b || @c        # Should parse as (@a && @b) || @c
/var @result3 = @a == @b && @c != @d  # Should parse as (@a == @b) && (@c != @d)
```

#### `single-line-enforcement.md`
```mlld
# Valid single-line
/when @prod => @config = "production"
/when @dev => @setup() = @devSetup()

# Invalid multi-line (should error)
/when @test => @template = `
  multi
  line
`
```

### Integration Tests
- Operator precedence: `@a || @b && @c`
- Nested expressions: `@a ? @b ? @c : @d : @e`
- Complex routing with all features combined
- Error cases and recovery
- Type coercion edge cases
- Short-circuit evaluation verification

## 7. Success Criteria

1. All existing syntax continues to work
2. New operators follow mlld's type coercion rules
3. Implicit syntax produces identical AST (except `meta.implicit`)
4. Error messages clearly guide to best practices
5. Documentation shows both explicit and implicit forms
6. Performance impact < 5%

## 8. Critical Implementation Notes

### Grammar-Type Synchronization
- **Every grammar change must have corresponding type updates**
- Type definitions come BEFORE grammar implementation
- Use type guards consistently throughout the codebase

### Error Message Quality
- All error messages should suggest the correct mlld pattern
- Include examples in error messages where helpful
- Guide users toward mlld best practices (define complex logic separately)

### Performance Considerations
- Expression parsing adds complexity - monitor parse times
- Short-circuit evaluation is critical for performance
- Consider memoization for complex repeated expressions

### Backward Compatibility
- All existing when conditions must continue to work
- Existing negation patterns remain functional
- No breaking changes to AST structure for existing features

## 9. Future Considerations

Once stable, consider:
- Array/object membership operator (`in`)
- Optional chaining (`?.`) - though mlld is already forgiving
- Pattern matching in when expressions

These features transform mlld from a simple template language into a powerful routing and logic system while maintaining its clarity and simplicity.