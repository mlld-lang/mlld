# Implementation Context: Grammar Updates for TTL, Trust, and Unified Tail Modifiers

## Mission Brief

Implement three interconnected grammar features to make mlld's command execution syntax more consistent and powerful:

1. **TTL (Time-To-Live)** for caching: `@path url = https://api.com (5d) trust always`
2. **Unified tail modifiers**: All command executions support `trust`, `pipeline` (or `|`), `needs`, and `with`
3. **Exec invocations everywhere**: `@greeting() | @uppercase` works in any directive (no @run wrapper needed)

## Current State vs Target State

### Current (Inconsistent)
```mlld
# Only some contexts support modifiers
@text data = @run @fetchAPI() | @parse     # Needs @run wrapper
@output @generateReport() [file.md]         # No modifiers allowed
@add @greeting()                            # No modifiers allowed
```

### Target (Unified)
```mlld
# All contexts support modifiers uniformly
@text data = @fetchAPI() | @parse          # Direct invocation with pipeline
@output @generateReport() trust always [file.md]  # Direct with trust
@add @greeting() | @uppercase              # Direct with pipeline
```

## Key Design Decisions Made

1. **Syntactic Sugar**: Single modifiers can use shorthand (`trust always`), multiple require `with { ... }`
2. **Pipe operator**: `|` is an alias for `pipeline`
3. **TTL position**: After source value, before tail modifiers (path/import only)
4. **AST normalization**: All tail modifiers become `withClause` in the AST
5. **Backwards compatible**: `@run @command()` still works but becomes redundant

## Implementation Resources

### Essential Reading (in order)
1. `/grammar/README.md` - **MANDATORY**: Grammar development principles
2. `/docs/dev/specs/grammar-implementation-plan.md` - Step-by-step implementation guide
3. `/docs/dev/specs/ttl-trust-syntax.md` - Feature specification
4. Issue #214 - Original requirements

### Key Principles (from grammar README)
- **Abstraction-First Design**: Build reusable patterns, don't duplicate
- **Single Source of Truth**: Each pattern defined once
- **Grammar-Type Synchronization**: Update types with grammar
- **Test with AST**: Use `npm run ast -- '@your syntax'` frequently

### Updated Parse Trees
All directive parse trees in `/grammar/README.md` have been updated with "(Target Design)" showing the expected end state. These are the source of truth for implementation.

## Implementation Approach

1. **Start with core patterns** in `patterns/`:
   - `tail-modifiers.peggy` - Unified tail syntax
   - `ttl-syntax.peggy` - TTL parsing
   - `exec-invocation.peggy` - Exec with tail support

2. **Update directives incrementally**:
   - Each directive gets `ExecInvocationWithTail` support
   - Test each change with `npm run ast`
   - Ensure AST normalization works

3. **Type updates are minimal**:
   - Add `ttl?: TTLOption` to path/import
   - Add `withClause?: WithClauseValues` where needed
   - Types mostly "just work" due to existing structure

## Success Criteria

The implementation is complete when:
- `@command() | @pipeline` works in all contexts
- `@path url = https://api.com (5d) trust always` parses correctly
- All tail modifiers normalize to `withClause` in AST
- Existing tests pass, new tests cover all scenarios
- Parse trees match implementation exactly

## Warning from History

Read "The Delimiter Standardization Disaster" in the grammar README. The key lesson: fix core abstractions, not symptoms. When adding tail modifier support, update the shared patterns once, not each directive individually.

Good luck! The grammar awaits your careful modifications.