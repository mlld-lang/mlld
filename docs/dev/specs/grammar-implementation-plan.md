# Grammar Implementation Plan: TTL, Trust, and Unified Tail Modifiers

## Overview

This plan details the implementation of three interconnected grammar features:
1. TTL (Time-To-Live) syntax for @path and @import
2. Trust levels and unified tail modifier syntax
3. Tail modifier support on all exec invocations

## Critical: Read Before Starting

**MANDATORY READING**: 
- `/grammar/README.md` - The sacred text of grammar development
- Especially sections on:
  - Abstraction-First Design
  - Single Source of Truth
  - Grammar-Type Synchronization
  - The Delimiter Standardization Disaster (lessons learned)

## Design Specifications

### 1. TTL Syntax
- Pattern: `@directive variable = source (ttl) [tail modifiers]`
- Applies to: @path and @import only
- TTL formats: numeric (ms), natural language (5m, 2h, 7d), special (static)
- Position: After source value, before tail modifiers

### 2. Tail Modifier Syntax
- Keywords: `trust`, `pipeline`, `|`, `needs`, `with`
- All keywords except `with` are syntactic sugar
- `|` is an alias for `pipeline`
- When using `with`, all modifiers go inside the object

### 3. Unified Exec Invocation Support
- Goal: `@command(args) [tail modifiers]` works everywhere
- No @run wrapper needed for tail modifiers
- Normalizes to same AST structure as @run

## Implementation Steps

### Phase 1: Create Core Patterns

#### 1.1 Create `patterns/tail-modifiers.peggy`

```peggy
// TAIL MODIFIERS - Unified syntax for directive modifiers
// Used by: All directives that support command execution
// Purpose: Provide consistent tail modifier syntax across mlld

TailModifiers "tail modifiers"
  = _ keyword:TailKeyword _ value:TailValue {
      if (keyword === "with") {
        return value; // Already an object
      } else if (keyword === "|") {
        return { pipeline: value };
      } else {
        return { [keyword]: value };
      }
    }

TailKeyword = "trust" / "pipeline" / "|" / "needs" / "with"

TailValue
  = "{" _ props:WithProperties _ "}" { return props; }      // for 'with'
  / "[" _ items:TransformerList _ "]" { return items; }     // for 'pipeline'
  / transformers:PipelineShorthand { return transformers; }  // for '|'
  / level:TrustLevel { return level; }                       // for 'trust'
  / deps:DependencyObject { return deps; }                   // for 'needs'

TrustLevel = "always" / "never" / "verify"

PipelineShorthand
  = first:CommandReference rest:(_ ref:CommandReference { return ref; })* {
      return [first, ...rest];
    }
```

#### 1.2 Create `patterns/ttl-syntax.peggy`

```peggy
// TTL SYNTAX - Time-to-live cache duration
// Used by: @path and @import directives
// Purpose: Parse cache duration specifications

TTLClause "TTL clause"
  = "(" _ ttl:TTLValue _ ")" { return ttl; }

TTLValue
  = num:Integer unit:TimeUnit { 
      return { value: num, unit: unit }; 
    }
  / num:Integer { 
      return { value: num, unit: 'ms' }; 
    }
  / "static" { 
      return { special: 'static' }; 
    }

TimeUnit = "s" / "m" / "h" / "d" / "w"
```

#### 1.3 Create `patterns/exec-invocation.peggy`

```peggy
// EXEC INVOCATION - Unified exec command invocation with tail support
// Used by: All directives that accept exec invocations
// Purpose: Parse exec invocations with optional tail modifiers

ExecInvocationWithTail "exec invocation"
  = ref:CommandReference tail:TailModifiers? {
      return {
        type: 'ExecInvocation',
        commandRef: ref,
        withClause: tail || null
      };
    }
```

### Phase 2: Update Directive Grammars

#### 2.1 Update `directives/path.peggy`

Add TTL and tail modifier support:
```peggy
AtPath
  = DirectiveContext "@path" _ id:BaseIdentifier _ "=" _ 
    path:WrappedPathContent ttl:(_ TTLClause)? tail:TailModifiers? {
      // Include ttl in values, tail becomes withClause
    }
```

#### 2.2 Update `directives/import.peggy`

Similar pattern for import:
```peggy
AtImport
  = DirectiveContext "@import" _ imports:ImportPattern _ "from" _ 
    source:ImportSource ttl:(_ TTLClause)? tail:TailModifiers? {
      // Include ttl in values, tail becomes withClause
    }
```

#### 2.3 Update `directives/add.peggy`

Replace direct command reference with ExecInvocationWithTail:
```peggy
AddContent
  = TemplateLiteral
  / PathContent
  / ExecInvocationWithTail  // Replaces simple CommandReference
  / Variable
  / StringLiteral
```

#### 2.4 Update `directives/text.peggy`

Update RHS patterns to use ExecInvocationWithTail:
```peggy
TextRHS
  = TemplateLiteral
  / PathContent  
  / ExecInvocationWithTail  // Replaces simple CommandReference
  / RunDirective           // Keep for @run support
  / StringLiteral
```

#### 2.5 Update `directives/data.peggy`

Similar updates for data values and foreach:
```peggy
DataValue
  = ObjectLiteral
  / ArrayLiteral
  / ExecInvocationWithTail  // Add this
  / RunDirective
  / Primitive

ForeachExpression
  = "foreach" _ cmd:ExecInvocationWithTail _ "(" _ arrays:ArrayList _ ")" {
      // Handle foreach with tail modifiers
    }
```

#### 2.6 Update `directives/output.peggy`

Update OutputSource to support tail modifiers:
```peggy
OutputSource
  = ExecInvocationWithTail  // Replaces OutputVariable for invocations
  / Variable                // Keep for simple variables
  / RunDirective
  / StringLiteral
```

#### 2.7 Update `directives/when.peggy`

Update condition patterns:
```peggy
WhenCondition
  = ExecInvocationWithTail  // For @isReady() | @validate
  / Variable                 // For simple @varname
```

### Phase 3: Update Type Definitions

#### 3.1 Update `core/types/path.ts`

```typescript
export interface PathValues {
  identifier: VariableNodeArray;
  path: PathNodeArray;
  ttl?: TTLOption;           // Add TTL
  withClause?: WithClauseValues; // Add tail modifiers
}
```

#### 3.2 Update `core/types/import.ts`

```typescript
export interface ImportValues {
  imports: ImportNodeArray;
  source: ImportSourceNode;
  ttl?: TTLOption;           // Add TTL
  withClause?: WithClauseValues; // Add tail modifiers
}
```

#### 3.3 Create unified exec invocation type

```typescript
export interface ExecInvocationNode {
  type: 'ExecInvocation';
  commandRef: CommandReference;
  withClause?: WithClauseValues;
}
```

### Phase 4: Update AST Helpers

#### 4.1 Update `grammar/deps/grammar-core.js`

Add helpers for creating normalized AST nodes:
```javascript
export const helpers = {
  // ... existing helpers ...
  
  createExecInvocation(commandRef, withClause, location) {
    return {
      type: NodeType.ExecInvocation,
      commandRef,
      withClause: withClause || null,
      location
    };
  },
  
  normalizeTailModifiers(tailKeyword, tailValue) {
    if (tailKeyword === 'with') return tailValue;
    if (tailKeyword === '|') return { pipeline: tailValue };
    return { [tailKeyword]: tailValue };
  }
};
```

### Phase 5: Testing Strategy

#### 5.1 Create test cases in `tests/cases/valid/`

1. **TTL tests**:
   - `path/ttl-syntax/` - Various TTL formats
   - `import/ttl-syntax/` - TTL on imports

2. **Tail modifier tests**:
   - `exec-invocations/trust/` - Trust on exec invocations
   - `exec-invocations/pipeline/` - Pipeline on exec invocations
   - `exec-invocations/with-clause/` - Full with clause

3. **Integration tests**:
   - `unified-syntax/` - Combinations of features

#### 5.2 Grammar tests

Create `grammar/tests/tail-modifiers.test.ts`:
- Test each directive's support for tail modifiers
- Verify AST normalization
- Check error cases

### Phase 6: Interpreter Updates

The interpreter should largely "just work" if AST normalization is correct, but verify:

1. `interpreter/eval/path.ts` - Handle TTL in path evaluation
2. `interpreter/eval/import.ts` - Handle TTL in import evaluation
3. `interpreter/eval/` - Ensure all evaluators handle ExecInvocation nodes

## Critical Success Factors

1. **Follow Grammar Principles**: 
   - Don't violate abstraction-first design
   - Reuse patterns, don't duplicate
   - Fix core abstractions, not symptoms

2. **Maintain Type Sync**:
   - Update types before/with grammar
   - Ensure AST matches TypeScript interfaces
   - Test type guards work

3. **Test Incrementally**:
   - Build one pattern at a time
   - Test with `npm run ast`
   - Run grammar tests frequently

4. **AST Normalization**:
   - All tail modifiers → withClause
   - Consistent structure across directives
   - Interpreter sees unified format

## Common Pitfalls to Avoid

1. **Don't use .raw fields** - Use proper AST evaluation
2. **Don't create local patterns** - Use shared abstractions
3. **Don't skip type updates** - Grammar and types must sync
4. **Don't parse tail modifiers differently** - One pattern for all

## Validation Checklist

Before considering implementation complete:

- [ ] All parse trees in README.md updated and accurate
- [ ] Grammar builds without errors
- [ ] AST output matches expected structure
- [ ] Types compile without errors
- [ ] All existing tests still pass
- [ ] New test cases cover all scenarios
- [ ] No duplicate patterns introduced
- [ ] Abstraction hierarchy maintained

## References

- `/grammar/README.md` - Grammar development principles
- `/docs/dev/specs/ttl-trust-syntax.md` - Feature specification
- `/docs/dev/WITH.md` - With clause documentation
- Issue #214 - Original feature request