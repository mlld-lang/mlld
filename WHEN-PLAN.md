# WHEN-PLAN: Implementation Plan for @when Directive

## Overview

This document provides a detailed, phase-by-phase implementation plan for adding the `@when` conditional directive to mlld. The implementation follows established patterns in the codebase.

## Implementation Status

**Last Updated**: 2025-06-03

### Completed
- ✅ Phase 1.1: Type Definitions (core/types/primitives.ts, core/types/when.ts)
- ✅ Phase 1.2: Grammar File (grammar/directives/when.peggy)
- ✅ Phase 1.3: Main Grammar Update (grammar/mlld.peggy)
- ✅ Phase 1.4: Grammar Core Update (grammar/deps/grammar-core.ts)
- ✅ Initial test fixture created and passing
- ✅ Phase 2: Interpreter implementation
  - ✅ interpreter/eval/when.ts - Complete evaluator with all modifiers
  - ✅ core/errors/MlldConditionError.ts - Error handling
  - ✅ interpreter/eval/directive.ts - Router integration
  - ✅ interpreter/core/interpreter.ts - Command execution support
  - ✅ All fixture tests passing (when-simple, when-block-all, when-block-any, when-block-first, when-variable-binding)

### Todo
- Phase 3: Documentation
- Phase 4: Unit test updates (when.test.ts needs updating to match new interface)

### Important Implementation Notes

#### Condition Syntax Limitations
**CRITICAL**: The current grammar implementation only supports predefined commands as conditions. All conditions must be defined using `@exec` either in the file or imported.

**Supported**:
```mlld
@exec is_true() = @run [echo "true"]
@when @is_true() => @add "Success!"
```

**NOT Supported** (known limitation):
```mlld
@when @run [echo "true"] => @add "Success!"
```

This is a deliberate design decision as the primary use case involves predefined condition commands (similar to underscore.js predicates). Direct `@run` in conditions has been documented as a low-priority bug.

## Phase 1: Grammar and AST (2-3 days)

### 1.1 Update Type Definitions

**File**: `core/types/primitives.ts`

```typescript
// Add to DirectiveKind
export type DirectiveKind = 
  | 'run'
  | 'import' 
  | 'add'
  | 'exec'
  | 'text'
  | 'path'
  | 'data'
  | 'output'
  | 'when'; // NEW

// Add to DirectiveSubtype  
export type DirectiveSubtype =
  | 'importAll' | 'importSelected'
  // ... existing subtypes ...
  | 'whenSimple' | 'whenBlock'; // NEW
```

**File**: `core/types/when.ts` (new file)

```typescript
import type { DirectiveNode, BaseMlldNode } from './nodes';

export type WhenModifier = 'first' | 'all' | 'any';

export interface WhenConditionPair {
  condition: BaseMlldNode[];
  action?: BaseMlldNode[];
}

export interface WhenSimpleNode extends DirectiveNode {
  kind: 'when';
  subtype: 'whenSimple';
  values: {
    condition: BaseMlldNode[];
    action: BaseMlldNode[];
  };
}

export interface WhenBlockNode extends DirectiveNode {
  kind: 'when';
  subtype: 'whenBlock';
  values: {
    variable?: BaseMlldNode[];
    modifier: BaseMlldNode[]; // Text node with modifier value
    conditions: WhenConditionPair[];
    action?: BaseMlldNode[];
  };
  meta: {
    modifier: WhenModifier;
    conditionCount: number;
  };
}
```

### 1.2 Create Grammar File

**File**: `grammar/directives/when.peggy`

```peggy
// WHEN DIRECTIVE
// Implementation of the @when directive for conditional execution

// Primary @when directive
AtWhen
  = WhenSimpleForm
  / WhenBlockForm

// Simple form: @when <condition> => <action>
WhenSimpleForm
  = DirectiveContext "@when" _ condition:WhenConditionExpression _ "=>" _ action:WhenAction {
      helpers.debug('WhenSimpleForm matched', { condition, action });
      
      return helpers.createStructuredDirective(
        'when',
        'whenSimple',
        {
          condition: condition,
          action: action
        },
        {
          condition: helpers.reconstructRawString(condition),
          action: helpers.reconstructRawString(action)
        },
        {
          hasVariables: condition.some(n => n.type === NodeType.VariableReference)
        },
        location()
      );
    }

// Block form: @when <var> <modifier>: [...]
WhenBlockForm
  = DirectiveContext "@when" _ variable:("@" id:BaseIdentifier { return id; })? _ 
    modifier:WhenModifier _ ":" _ "[" _ conditions:WhenConditionList _ "]" 
    _ action:("=>" _ a:WhenAction { return a; })? {
      
      const values = {
        conditions: conditions,
        modifier: [helpers.createNode(NodeType.Text, { 
          content: modifier, 
          location: location() 
        })]
      };
      
      if (variable) {
        values.variable = [helpers.createVariableReferenceNode('identifier', {
          identifier: variable
        })];
      }
      
      if (action) {
        values.action = action;
      }
      
      return helpers.createStructuredDirective(
        'when',
        'whenBlock',
        values,
        {
          variable: variable || undefined,
          modifier: modifier,
          conditions: conditions.map(c => ({
            condition: helpers.reconstructRawString(c.condition),
            action: c.action ? helpers.reconstructRawString(c.action) : undefined
          })),
          action: action ? helpers.reconstructRawString(action) : undefined
        },
        {
          modifier: modifier,
          conditionCount: conditions.length,
          hasVariable: !!variable
        },
        location()
      );
    }

// Modifiers
WhenModifier
  = "first" / "all" / "any"

// List of condition => action pairs
WhenConditionList
  = first:WhenConditionPair rest:(_ pair:WhenConditionPair { return pair; })* {
      return [first, ...rest];
    }

// Single condition => action pair
WhenConditionPair
  = condition:WhenConditionExpression _ action:("=>" _ a:WhenAction { return a; })? {
      return { condition, action };
    }

// Condition expression (any expression that produces a value)
WhenConditionExpression
  = CommandReference  // @command() or @command
  / RunDirective      // @run [...]
  / Variable          // @variable
  / ForeachExpression // foreach @cmd(@array)

// Action (single directive or block of directives)
WhenAction
  = WhenActionBlock
  / WhenActionDirective

// Block of directives as action
WhenActionBlock
  = "[" _ first:WhenActionDirective rest:(_ d:WhenActionDirective { return d; })* _ "]" {
      return [first, ...rest].flat();
    }

// Single directive as action
WhenActionDirective
  = AtAdd / AtText / AtData / AtPath / AtRun / AtOutput / AtWhen
```

### 1.3 Update Main Grammar

**File**: `grammar/mlld.peggy`

```peggy
// Add to Directive rule
Directive
  = &{ return helpers.isLogicalLineStart(input, offset()); }
    [ \t]*
    dir:(
      AtRun
    / AtExec
    / AtText
    / AtImport
    / AtAdd
    / AtData
    / AtPath
    / AtOutput
    / AtWhen  // NEW
    ) { return dir; }
```

### 1.4 Update Grammar Core

**File**: `grammar/parser/grammar-core.ts`

```typescript
// Add to DirectiveKind
export const DirectiveKind = {
  run: 'run',
  add: 'add',
  text: 'text',
  exec: 'exec',
  data: 'data',
  path: 'path',
  import: 'import',
  output: 'output',
  when: 'when'  // NEW
};
```

### 1.5 Create Grammar Tests

**File**: `grammar/tests/when.test.ts`

```typescript
import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('When Directive Grammar', () => {
  test('Simple form', async () => {
    const content = `@when @file_exists("test.txt") => @add "File found!"`;
    const result = await parse(content);
    
    const directive = result.ast[0];
    expect(directive.kind).toBe('when');
    expect(directive.subtype).toBe('whenSimple');
    expect(directive.values).toHaveProperty('condition');
    expect(directive.values).toHaveProperty('action');
  });
  
  test('Block form - first modifier', async () => {
    const content = `@when @result first: [
      @contains("yes") => @text answer = "yes"
      @contains("no") => @text answer = "no"
    ]`;
    const result = await parse(content);
    
    const directive = result.ast[0];
    expect(directive.kind).toBe('when');
    expect(directive.subtype).toBe('whenBlock');
    expect(directive.meta.modifier).toBe('first');
    expect(directive.values.conditions).toHaveLength(2);
  });
  
  // Add more comprehensive tests...
});
```

## Phase 2: Interpreter (2-3 days)

### 2.1 Create When Evaluator

**File**: `interpreter/eval/when.ts` (new file)

```typescript
import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { evaluate } from '../core/interpreter';
import { MlldConditionError, MlldParseError } from '@core/errors';

export async function evaluateWhen(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  switch (directive.subtype) {
    case 'whenSimple':
      return evaluateWhenSimple(directive, env);
    case 'whenBlock':
      return evaluateWhenBlock(directive, env);
    default:
      throw new Error(`Unknown when subtype: ${directive.subtype}`);
  }
}

async function evaluateWhenSimple(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const condition = directive.values.condition;
  const action = directive.values.action;
  
  const conditionResult = await evaluateCondition(condition, env);
  
  if (conditionResult) {
    return await evaluate(action, env);
  }
  
  return { value: '', env };
}

async function evaluateWhenBlock(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  const modifier = directive.meta.modifier as WhenModifier;
  const conditions = directive.values.conditions as WhenConditionPair[];
  const blockAction = directive.values.action;
  
  switch (modifier) {
    case 'first':
      return evaluateWhenFirst(conditions, env);
    case 'all':
      return evaluateWhenAll(conditions, blockAction, env);
    case 'any':
      return evaluateWhenAny(conditions, blockAction, env);
    default:
      throw new Error(`Unknown when modifier: ${modifier}`);
  }
}

async function evaluateCondition(
  condition: BaseMlldNode[],
  env: Environment
): Promise<boolean> {
  try {
    const result = await evaluate(condition, env);
    
    // Check for command execution result
    if (result.exitCode !== undefined && result.exitCode !== 0) {
      throw new MlldConditionError(
        `Condition command failed with exit code ${result.exitCode}`,
        {
          exitCode: result.exitCode,
          stderr: result.stderr,
          stdout: result.stdout
        }
      );
    }
    
    return isTruthy(result.value);
  } catch (error) {
    if (error instanceof MlldError) {
      throw error;
    }
    throw new MlldConditionError(
      'Error evaluating condition',
      { originalError: error }
    );
  }
}

function isTruthy(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return String(value).trim().length > 0;
}

// Implement evaluateWhenFirst, evaluateWhenAll, evaluateWhenAny...
// See error handling design document for detailed implementations
```

### 2.2 Create Error Types

**File**: `core/errors/MlldConditionError.ts` (new file)

```typescript
import { MlldDirectiveError } from './MlldDirectiveError';

export interface ErrorSummary {
  type: string;
  count: number;
  firstExample: {
    conditionIndex: number;
    message: string;
    details?: any;
  };
}

export class MlldConditionError extends MlldDirectiveError {
  constructor(
    message: string,
    public details: {
      exitCode?: number;
      stderr?: string;
      stdout?: string;
      command?: string;
      conditionIndex?: number;
      modifier?: 'first' | 'all' | 'any';
      originalError?: Error;
      errors?: ErrorSummary[];
    } = {}
  ) {
    super('when', message);
  }
}
```

### 2.3 Update Directive Router

**File**: `interpreter/eval/directive.ts`

```typescript
import { evaluateWhen } from './when';

export async function evaluateDirective(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  switch (directive.kind) {
    case 'text':
      return evaluateText(directive, env);
    case 'data':
      return evaluateData(directive, env);
    // ... existing cases ...
    case 'when':
      return evaluateWhen(directive, env);  // NEW
    default:
      throw new Error(`Unknown directive kind: ${directive.kind}`);
  }
}
```

### 2.4 Add Warning Logger to Environment

**File**: `interpreter/env/Environment.ts`

```typescript
export class Environment {
  // ... existing code ...
  
  logWarning(message: string, details?: any): void {
    if (this.config.logLevel !== 'silent') {
      console.warn(`⚠️  ${message}`, details);
    }
  }
}
```

## Phase 3: Testing (2 days)

### 3.1 Create Test Fixtures

Create test cases in `tests/cases/valid/when/`:

- `simple/` - Simple form tests
- `block-first/` - First modifier tests  
- `block-all/` - All modifier tests
- `block-any/` - Any modifier tests
- `nested-actions/` - Block action tests
- `with-foreach/` - Integration with foreach
- `error-handling/` - Error scenarios

Example test structure:
```
tests/cases/valid/when/simple/
  example.md      # @when @true() => @add "Success!"
  expected.md     # Success!
```

### 3.2 Create Error Test Fixtures

Create test cases in `tests/cases/exceptions/when/`:

- `syntax-errors/` - Missing arrows, invalid modifiers
- `command-failures/` - Non-zero exit codes
- `any-all-fail/` - All conditions error in any block

### 3.3 Update Fixture Test Runner

**File**: `interpreter/interpreter.fixture.test.ts`

```typescript
// Add support for when directive tests
// Handle warning output validation for any modifier
```

### 3.4 Create Integration Tests

**File**: `interpreter/when.test.ts` (new file)

```typescript
import { describe, it, expect } from 'vitest';
import { interpret } from './index';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';

describe('When Directive Integration', () => {
  it('should handle foreach in conditions', async () => {
    const fs = new MemoryFileSystem();
    const content = `
@data files = ["a.txt", "b.txt"]
@exec file_exists(f) = @run [echo "true"]
@when @all_exist all: [
  foreach @file_exists(@files)
] => @add "All exist"
`;
    const result = await interpret(content, { fileSystem: fs });
    expect(result).toContain('All exist');
  });
  
  // Add more integration tests...
});
```

## Phase 4: Documentation (1 day)

### 4.1 Update Syntax Reference

**File**: `docs/syntax-reference.md`

Add section on @when directive with examples.

### 4.2 Create Directive Documentation

**File**: `docs/directives/when.md`

Comprehensive documentation including:
- Syntax forms
- Truthiness model
- Error handling
- Integration with other features
- Best practices

### 4.3 Create Examples

**File**: `examples/when-conditions.mld`

Practical examples showing common patterns.

### 4.4 Update Changelog

**File**: `CHANGELOG.md`

Document the new feature.

## Testing Strategy

1. **Unit Tests**
   - Grammar parsing for all syntax forms
   - Truthiness evaluation
   - Error handling for each modifier

2. **Integration Tests**  
   - With foreach
   - With imports
   - Nested when directives
   - Complex condition expressions

3. **Error Tests**
   - Syntax errors
   - Runtime errors
   - Error aggregation for any modifier

4. **Performance Tests**
   - Deep nesting (up to limit)
   - Many conditions in block form

## Rollout Strategy

1. **Initial Release**: Simple form only (lower risk)
2. **Follow-up**: Block form with modifiers
3. **Future**: Performance optimizations (caching, parallelization)

## Success Metrics

1. All tests pass
2. No performance regression
3. Clear error messages
4. Documentation complete
5. No breaking changes to existing features

## Risk Mitigation

1. **Grammar Conflicts**: Implement incrementally, test thoroughly
2. **Performance**: Add depth limits, profile with large blocks
3. **Error Clarity**: Extensive error message testing
4. **Integration Issues**: Comprehensive integration test suite

## Timeline

- **Total**: 7-9 days
- **Buffer**: +2 days for unexpected issues
- **Review**: 1 day for code review and feedback

## Dependencies

- No external dependencies
- Uses existing error handling system
- Leverages current AST structure
- Builds on established patterns