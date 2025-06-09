# Grammar TTL/Trust Implementation Handoff

## Summary of Work Completed

We've successfully implemented Phase 1 and Phase 2 of the grammar implementation plan for TTL, trust levels, and unified tail modifiers. The grammar now supports:

1. **TTL (Time-To-Live)** on `@path` and `@import` directives for URL caching
2. **Trust levels** (always/never/verify) as part of unified tail modifiers
3. **Unified tail modifier syntax** where trust, pipeline (|), needs, and with all normalize to `withClause`
4. **Exec invocations with tail modifiers** - commands defined with `@exec` can now use tail modifiers without requiring `@run` wrapper

## What Was Changed

### New Grammar Files Created
1. `/grammar/patterns/tail-modifiers.peggy` - Unified tail modifier parsing
2. `/grammar/patterns/ttl-syntax.peggy` - TTL parsing (5d, 30m, static, etc.)
3. `/grammar/patterns/exec-invocation.peggy` - Exec invocations with tail support

### Updated Grammar Files
1. `/grammar/directives/path.peggy` - Added TTL and tail modifier support
2. `/grammar/directives/import.peggy` - Added TTL and tail modifier support
3. `/grammar/directives/add.peggy` - Added ExecInvocationWithTail support
4. `/grammar/directives/text.peggy` - Added ExecInvocationWithTail support
5. `/grammar/directives/data.peggy` - Added ExecInvocationWithTail support
6. `/grammar/directives/output.peggy` - Added ExecInvocationWithTail support
7. `/grammar/directives/when.peggy` - Added ExecInvocationWithTail support
8. `/grammar/directives/run.peggy` - Updated to use TailModifiers instead of WithClause

## Current State

### What's Working
- Grammar compiles successfully
- AST generation works correctly for all new syntax:
  ```
  @path api = [https://api.com] (5d) trust always
  @import [config.mld] (30s) | @validate
  @add @greeting() | @uppercase
  @data config = @getConfig() | @json
  @run [(npm test)] | @filter("error")
  ```
- All syntax normalizes to `withClause` in the AST
- 157 tests pass, 9 skipped, ~63 failing (expected due to interpreter not being updated)

### What Needs to Be Done

## Phase 3: Update Type Definitions

### 1. Update AST Node Types (`/core/types/nodes.ts`)
Add:
```typescript
export interface WithClause {
  trust?: TrustLevel;
  pipeline?: PipelineCommand[];
  needs?: NeedsObject;
  [key: string]: any; // For other with clause properties
}

export interface TTLValue {
  type: 'static' | 'duration';
  value: number;
  unit?: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks';
  seconds: number; // Normalized value in seconds
}

export interface ExecInvocation {
  type: 'ExecInvocation';
  commandRef: CommandReference;
  withClause?: WithClause;
}
```

### 2. Update Directive Types
- Add `withClause?: WithClause` to all directive types
- Add `ttl?: TTLValue` to PathDirective and ImportDirective
- Update values types to include ExecInvocation where applicable

### 3. Update Type Guards (`/core/types/guards.ts`)
Add type guards for new types:
```typescript
export function isExecInvocation(node: any): node is ExecInvocation {
  return node?.type === 'ExecInvocation';
}

export function hasWithClause(directive: any): directive is { withClause: WithClause } {
  return directive?.values?.withClause !== undefined;
}
```

## Phase 4: Update AST Helpers

### 1. Create/Update Helper Functions
- Add helpers for extracting withClause components
- Add TTL parsing and normalization helpers
- Add exec invocation handling helpers

### 2. Update Grammar Core Helpers (`/grammar/deps/grammar-core.js`)
Already includes `ttlToSeconds` helper - may need additional helpers for working with withClause.

## Phase 5: Update Interpreter

### 1. Update Directive Evaluators
Each evaluator needs to handle `withClause` and apply transformations:

- `/interpreter/eval/path.ts` - Handle TTL for caching
- `/interpreter/eval/import.ts` - Handle TTL for module caching
- `/interpreter/eval/run.ts` - Apply pipeline transformations
- `/interpreter/eval/add.ts` - Handle exec invocations with pipelines
- `/interpreter/eval/text.ts` - Handle exec invocations
- `/interpreter/eval/data.ts` - Handle exec invocations
- `/interpreter/eval/output.ts` - Handle exec invocations
- `/interpreter/eval/when.ts` - Handle exec invocations in conditions

### 2. Implement Pipeline Processing
Create a pipeline processor that:
1. Takes initial output
2. Passes through each pipeline command
3. Each command receives previous output as `@input`
4. Returns final transformed output

### 3. Implement Trust Validation
- Create trust validator that checks trust levels
- Integrate with security manager
- Handle always/never/verify logic

### 4. Implement TTL Caching
- Update URL cache to respect TTL values
- Update module cache to respect TTL values
- Handle 'static' TTL (cache forever)

## Phase 6: Update Test Cases

### 1. Create New Test Cases
Location: `/tests/cases/valid/`

Create test cases for:
- `ttl/path-with-ttl/` - Path directive with TTL
- `ttl/import-with-ttl/` - Import directive with TTL
- `tail-modifiers/trust-levels/` - Trust level examples
- `tail-modifiers/pipeline/` - Pipeline examples
- `tail-modifiers/exec-invocations/` - Exec invocations with modifiers

### 2. Update Existing Test Fixtures
Run `npm run build:fixtures` to regenerate all test fixtures with new AST structure.

### 3. Fix Failing Tests
Most failures are due to:
- Interpreter expecting old AST structure
- Missing withClause handling
- Type mismatches

## Phase 7: Update Documentation

### 1. Update `/docs/dev/AST.md`
Add sections for:
- WithClause normalization
- TTL field documentation
- ExecInvocation type
- Examples of tail modifier syntax

### 2. Update User Documentation
- `/docs/syntax-reference.md` - Add TTL and tail modifier syntax
- `/docs/directives/*.md` - Update each directive doc with new features
- Create `/docs/security.md` - Document trust levels

### 3. Update CHANGELOG.md
Document all new features and breaking changes.

## Critical Implementation Notes

### 1. AST Normalization
ALL tail modifiers normalize to `withClause`:
- `trust always` → `{ withClause: { trust: 'always' } }`
- `| @cmd` → `{ withClause: { pipeline: [...] } }`
- `needs {...}` → `{ withClause: { needs: {...} } }`
- `with {...}` → `{ withClause: {...} }`

### 2. TTL Formats
- Duration: `(5d)`, `(30m)`, `(2h)`, `(1w)`
- Static: `(static)` - cache forever
- Positioned after source, before tail modifiers

### 3. Exec Invocation Priority
When parsing `@command()`:
- With tail modifiers → ExecInvocation
- Without modifiers in certain contexts → Template/command invocation
- The "@" prefix in add directive prevents variable reference matching

### 4. Grammar Precedence
Rules are ordered specifically to ensure correct matching:
- Exec invocations before variable references
- Commands with brackets before language+code

## Testing Your Changes

1. **Grammar Testing**: `npm run ast -- '<mlld syntax>'`
2. **Full Test Suite**: `npm test`
3. **Specific Tests**: `npm test <file>`
4. **Fixture Generation**: `npm run build:fixtures`

## Known Issues

1. **Test Failures**: ~63 tests failing due to interpreter not handling new AST
2. **Documentation**: AST.md needs updating with new structures
3. **Type Definitions**: Not yet updated for new grammar

## Resources

- Implementation plan: `/grammar-implementation-plan.md`
- AST principles: `/docs/dev/AST.md`
- Grammar patterns: `/grammar/patterns/`
- Test cases: `/tests/cases/`

## Next Steps Priority

1. **Update types** (Phase 3) - Required for TypeScript compilation
2. **Update interpreter** (Phase 5) - Required for tests to pass
3. **Create test cases** (Phase 6) - Validate implementation
4. **Update documentation** (Phase 7) - Help users and future developers

The grammar work is complete and tested. The next Claude should start with updating the type definitions to match the new AST structure, then move on to updating the interpreter to handle the new features.