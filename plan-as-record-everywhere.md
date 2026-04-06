# Plan: `as record @schema` Everywhere

## Overview

This plan adds first-class inline dynamic record coercion as a terminal postfix expression:

```mlld
<fully-formed value expression> as record @schema
```

The feature is additive to the existing `=> record @schema` executable-output annotation. The implementation should reuse the same runtime record-resolution and coercion path so inline coercion gets identical validation, fact minting, trust refinement, `when` handling, `validate:` behavior, and `mx.schema` metadata.

This plan intentionally keeps scope tight in two places:

- dynamic inline coercion only; bare static `as contact` is out of scope
- `as record @schema` is terminal and non-chainable in the first implementation

The adjacent `m-bbe8` bug must land in the same work so totally-failed coercions still expose `mx.schema.valid == false`.

## Syntax Contract

### Accepted

```mlld
@rawJson | @parse.llm as record @contract
run cmd { ... } using auth:claude with { policy: @p } as record @schema
@worker(@task) with { policy: @plannerAuth } as record @schema
(@value as record @schema).mx.schema.valid
@candidate as record @contracts[@contractName]
@payload as record (@isAdmin ? @adminSchema : @userSchema)
```

### Rejected

```mlld
@value as record @schema with { ... }
@value as record @schema using auth:claude
@value as record @a as record @b
@value as contact
```

### Composition Rule

Producer modifiers first, coercion second, result access last.

- `using ...` stays attached to `run` / code producers
- `with { ... }` stays attached to invocations and value producers that already support it
- `as record @schema` applies after the full producer expression has resolved
- post-coercion field or index access requires parentheses

This rule avoids turning `with` into a new arbitrary-expression postfix operator.

## Must-Read References

- [.tickets/m-fd31.md](./.tickets/m-fd31.md)
- [.tickets/m-bbe8.md](./.tickets/m-bbe8.md)
- [docs/dev/TESTS.md](./docs/dev/TESTS.md)
- [docs/dev/DOCS.md](./docs/dev/DOCS.md)
- [docs/dev/GRAMMAR.md](./docs/dev/GRAMMAR.md)
- [docs/src/atoms/core/31-records--basics.md](./docs/src/atoms/core/31-records--basics.md)
- [docs/src/atoms/patterns/05-schema-validation.md](./docs/src/atoms/patterns/05-schema-validation.md)
- [grammar/base/unified-expressions.peggy](./grammar/base/unified-expressions.peggy)
- [grammar/patterns/var-rhs.peggy](./grammar/patterns/var-rhs.peggy)
- [grammar/patterns/data-values.peggy](./grammar/patterns/data-values.peggy)
- [grammar/patterns/unified-arguments.peggy](./grammar/patterns/unified-arguments.peggy)
- [grammar/patterns/with-clause.peggy](./grammar/patterns/with-clause.peggy)
- [grammar/directives/exe.peggy](./grammar/directives/exe.peggy)
- [core/types/primitives.ts](./core/types/primitives.ts)
- [core/types/var.ts](./core/types/var.ts)
- [core/types/executable.ts](./core/types/executable.ts)
- [core/types/index.ts](./core/types/index.ts)
- [core/types/guards.ts](./core/types/guards.ts)
- [interpreter/eval/expressions.ts](./interpreter/eval/expressions.ts)
- [interpreter/eval/data-value-evaluator.ts](./interpreter/eval/data-value-evaluator.ts)
- [interpreter/eval/data-values/DataValueEvaluator.ts](./interpreter/eval/data-values/DataValueEvaluator.ts)
- [interpreter/eval/data-values/VariableReferenceEvaluator.ts](./interpreter/eval/data-values/VariableReferenceEvaluator.ts)
- [interpreter/eval/var/rhs-dispatcher.ts](./interpreter/eval/var/rhs-dispatcher.ts)
- [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts)
- [interpreter/eval/records/coerce-record.ts](./interpreter/eval/records/coerce-record.ts)
- [tests/grammar/record.test.ts](./tests/grammar/record.test.ts)
- [interpreter/eval/exe.characterization.test.ts](./interpreter/eval/exe.characterization.test.ts)
- [interpreter/eval/records/coerce-record.test.ts](./interpreter/eval/records/coerce-record.test.ts)
- [tests/interpreter/exe-return-structured-metadata.test.ts](./tests/interpreter/exe-return-structured-metadata.test.ts)
- [tests/interpreter/hooks/guard-post-hook.test.ts](./tests/interpreter/hooks/guard-post-hook.test.ts)
- [tests/cases/exceptions/records/dynamic-output-record-not-record/example.mld](./tests/cases/exceptions/records/dynamic-output-record-not-record/example.mld)

## Current State

- Dynamic record coercion exists only on executable definitions via `=> record @schema` in [grammar/directives/exe.peggy](./grammar/directives/exe.peggy).
- Runtime record resolution for executable output lives inside [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts), not in a reusable helper.
- Record coercion semantics themselves already exist in [interpreter/eval/records/coerce-record.ts](./interpreter/eval/records/coerce-record.ts).
- The parser uses `as` today for aliasing and remapping, especially in [grammar/patterns/data-values.peggy](./grammar/patterns/data-values.peggy), so bare `as contact` would collide with existing grammar.
- `ExpressionWithOperator` in [grammar/patterns/var-rhs.peggy](./grammar/patterns/var-rhs.peggy) does not recognize `as`, so adding one expression rule in `UnifiedExpression` is not enough to make inline coercion parse in plain RHS positions.
- Function arguments use [grammar/patterns/unified-arguments.peggy](./grammar/patterns/unified-arguments.peggy), not `VarRHSContent`, so argument support must be wired explicitly.
- `using auth:name` is only a producer-level concept today. `with { ... }` is also producer-level today; neither is a general postfix operator on arbitrary expressions.
- `m-bbe8` is still open. Total coercion failure can lose `mx.schema`, which would make the new inline feature incomplete if left unfixed.

## Goals

1. Make `@value as record @schema` available in all value contexts that already support normal values.
2. Preserve exact runtime parity with `=> record @schema`.
3. Keep the syntax contract simple: terminal postfix, dynamic only, producer modifiers before coercion.
4. Support the important schema forms:
   - `@schema`
   - `@contracts.email`
   - `@contracts[@name]`
   - `(@cond ? @adminSchema : @userSchema)`
5. Keep errors aligned with the current dynamic-output-record behavior.
6. Ship docs and tests with the implementation.

## Non-Goals

- Bare static coercion such as `@value as contact`
- Post-coercion `with { ... }` or `using ...`
- Chainable coercion in one expression (`... as record @a as record @b`)
- Replacing or deprecating `=> record @schema`
- Any broader redesign of the `with` or `using` grammar

## Locked Decisions

### 1. `as record @schema` is terminal

Inline coercion is the last modifier on the producing expression. If callers want to inspect the result, they parenthesize:

```mlld
(@value as record @schema).mx.schema.valid
```

### 2. Dynamic only

The first implementation does not add bare `as contact`. That avoids collisions with current `as` alias grammar and keeps the ticket focused on the framework-driven use case that motivated it.

### 3. Reuse existing coercion semantics

Inline coercion must call the same runtime machinery as `=> record @schema`. No second validation path and no hand-copied trust/metadata logic.

### 4. Include `m-bbe8`

`mx.schema` must exist even on total coercion failure. Inline coercion should not ship with a known hole in the main guard/retry use case.

### 5. Keep `with` and `using` producer-scoped

Do not reinterpret:

- `@value as record @schema with { ... }`
- `@value as record @schema using auth:x`

as valid syntax. If allowed later, they should be a separate language change.

### 6. Prefer a dedicated AST node over overloading `BinaryExpression`

`as record` is not a normal binary operator in this design. A dedicated `CoerceExpression` node keeps evaluation, highlighting, token coverage, and future diagnostics clearer.

## Phase 0 - Freeze the Contract and Extract Shared Resolver (≈0.5 day)

**Goal**: Lock the final syntax/precedence contract and pull dynamic record resolution out of executable invocation so inline coercion can reuse it cleanly.

### Tasks

1. **Extract dynamic record resolution into a shared helper**
   - Move the reusable pieces out of [interpreter/eval/exec-invocation.ts](./interpreter/eval/exec-invocation.ts):
     - dynamic record reference resolution
     - record-definition normalization
     - display formatting for dynamic record refs
   - New home should be record-focused, for example:
     - `interpreter/eval/records/resolve-record-definition.ts`
   - The shared API should accept:
     - evaluated schema source or schema AST
     - environment(s)
     - source location
     - an owner label for error messages

2. **Keep executable output coercion on the same helper**
   - Change the existing `=> record @schema` path to call the shared resolver so inline coercion and executable-output coercion stay mechanically aligned.

3. **Freeze the syntax contract in code comments and tests**
   - Add or update characterization comments/tests so the terminal-postfix rule is encoded before parser work expands.

### Testing

- Extend [interpreter/eval/exe.characterization.test.ts](./interpreter/eval/exe.characterization.test.ts) if needed to prove executable-output coercion still resolves static and dynamic record refs through the shared helper.

### Exit Criteria

- [ ] Dynamic record-definition resolution no longer lives only in `exec-invocation.ts`.
- [ ] `=> record @schema` still behaves the same.
- [ ] The terminal-postfix contract is written down in tests or characterization comments.

## Phase 1 - Add `CoerceExpression` to the AST and Evaluator Surface (≈0.5-1 day)

**Goal**: Introduce a first-class AST node for inline coercion and wire it through every evaluator layer that already understands expressions and data values.

### Tasks

1. **Add the AST node and exports**
   - Update:
     - [core/types/primitives.ts](./core/types/primitives.ts)
     - [core/types/index.ts](./core/types/index.ts)
     - [core/types/guards.ts](./core/types/guards.ts)
     - [core/shared/types.ts](./core/shared/types.ts)
   - Add:
     - `CoerceExpression`
     - type guard
     - union membership in the public `MlldNode` / expression surfaces

2. **Decide the node shape**
   - Recommended shape:

   ```ts
   interface CoerceExpression {
     type: 'CoerceExpression';
     value: MlldNode;
     schema: MlldNode;
   }
   ```

   - `value` must be broad enough to cover:
     - variable refs
     - exec invocations
     - arrays / objects
     - run/code producers
     - when / for / loop / box results
   - `schema` must be broad enough to cover:
     - plain variable refs
     - field/bracket refs
     - parenthesized ternary or other expression forms

3. **Wire the node into evaluator dispatch**
   - Update:
     - [interpreter/core/interpreter/dispatch.ts](./interpreter/core/interpreter/dispatch.ts)
     - [interpreter/core/interpreter/evaluator.ts](./interpreter/core/interpreter/evaluator.ts)
     - [interpreter/eval/expressions.ts](./interpreter/eval/expressions.ts)
     - [interpreter/eval/data-value-evaluator.ts](./interpreter/eval/data-value-evaluator.ts)
     - [interpreter/eval/data-values/DataValueEvaluator.ts](./interpreter/eval/data-values/DataValueEvaluator.ts)
     - [interpreter/eval/var/rhs-dispatcher.ts](./interpreter/eval/var/rhs-dispatcher.ts)

4. **Implement evaluation**
   - Evaluate the `value` side through the normal evaluator path for that node type.
   - Evaluate the `schema` side through the normal evaluator path, then resolve it through the shared record-definition helper.
   - Preserve inherited security descriptors from the input value and pass them into [interpreter/eval/records/coerce-record.ts](./interpreter/eval/records/coerce-record.ts).
   - Ensure re-coercion refreshes `mx.schema` rather than short-circuiting on preexisting metadata.

5. **Update editor/token metadata**
   - Update the semantic/token plumbing so a new node type does not break editor-facing tests:
     - [core/highlighting/rules.ts](./core/highlighting/rules.ts)
     - [tests/utils/token-validator/NodeTokenMap.ts](./tests/utils/token-validator/NodeTokenMap.ts)
     - [tests/utils/token-validator/VisitorMapper.ts](./tests/utils/token-validator/VisitorMapper.ts)

### Testing

- Add focused evaluator tests for `CoerceExpression` in expression contexts.
- Keep `=> record @schema` tests green as regression coverage.

### Exit Criteria

- [ ] `CoerceExpression` exists as a first-class node.
- [ ] The evaluator can execute it outside executable-output coercion.
- [ ] Editor/token validation knows about the new node type.

## Phase 2 - Make the Grammar Accept Inline Coercion Everywhere (≈1-1.5 days)

**Goal**: Parse inline coercion in all normal value positions without turning `with` into an arbitrary postfix operator or breaking existing `as` alias behavior.

### Tasks

1. **Create a shared coercion suffix rule**
   - Add a shared grammar fragment, likely under:
     - [grammar/base/unified-expressions.peggy](./grammar/base/unified-expressions.peggy)
     - or a new pattern file if it keeps reuse cleaner
   - Shape:

   ```peggy
   RecordCoercionSuffix
     = _ "as" __ "record" __ schema:RecordSchemaExpression
   ```

2. **Add a schema-expression subrule**
   - Required forms:
     - `@schema`
     - `@contracts.email`
     - `@contracts[@name]`
     - `(@cond ? @adminSchema : @userSchema)`
   - Recommended approach:
     - plain ref path via `UnifiedVariableNoTail`
     - parenthesized expression via `("(" _ expr:UnifiedExpression _ ")")`
   - Keep the unparenthesized form conservative so `as record` stays easy to reason about.

3. **Wrap plain RHS parsing, not just operator expressions**
   - The important parser fix is not just `UnifiedExpression`.
   - Update:
     - [grammar/patterns/var-rhs.peggy](./grammar/patterns/var-rhs.peggy)
     - [grammar/patterns/data-values.peggy](./grammar/patterns/data-values.peggy)
     - [grammar/patterns/unified-arguments.peggy](./grammar/patterns/unified-arguments.peggy)
   - Inline coercion must parse in:
     - `/var` RHS
     - `let` RHS via `VarRHSContent`
     - object property values
     - array values
     - function/exe arguments
     - explicit expression contexts

4. **Teach `ExpressionWithOperator` about `as record`**
   - Update the lookahead in [grammar/patterns/var-rhs.peggy](./grammar/patterns/var-rhs.peggy) so:

   ```mlld
   @value as record @schema
   ```

   routes into the coercion-aware parse path instead of being consumed as a plain variable reference.

5. **Preserve producer-level `using` and `with` binding**
   - Confirm the accepted form parses as:

   ```mlld
   run cmd { ... } using auth:x with { policy: @p } as record @schema
   @worker(@task) with { policy: @p } as record @schema
   ```

   - Do not add support for post-coercion `with` or `using`.

6. **Keep static `as contact` out**
   - Do not disturb the existing alias/remap uses of bare `as`.
   - That means leaving [grammar/patterns/data-values.peggy](./grammar/patterns/data-values.peggy) `DataAliasedValue` behavior intact.

### Testing

- Extend [tests/grammar/record.test.ts](./tests/grammar/record.test.ts) with:
  - plain inline coercion
  - pipeline-terminal coercion
  - argument-position coercion
  - object/array value coercion
  - parenthesized schema-expression coercion
- Add invalid grammar coverage for:
  - `@value as record @schema with { ... }`
  - `@value as record @a as record @b`
  - `@value as contact`

### Exit Criteria

- [ ] Inline coercion parses in all intended value positions.
- [ ] Producer-level `using` and `with` still bind before coercion.
- [ ] Bare static `as contact` still does not parse.
- [ ] Chained coercion still does not parse.

## Phase 3 - Runtime Parity and Edge-Case Semantics (≈0.5-1 day)

**Goal**: Ensure inline coercion exactly matches executable-output coercion, including malformed-input and guard-facing metadata behavior.

### Tasks

1. **Apply the same descriptor merge behavior**
   - Inline coercion should inherit the same recursive descriptor merge that executable-output coercion uses before calling `coerceRecordOutput(...)`.

2. **Land `m-bbe8` in the same branch**
   - Fix [interpreter/eval/records/coerce-record.ts](./interpreter/eval/records/coerce-record.ts) so totally-failed coercions still attach:
     - `mx.schema.valid`
     - `mx.schema.errors`
     - `mx.schema.mode`
   - This is required for:
     - guard retries
     - `(@value as record @schema).mx.schema.valid`
     - framework wrappers being removed cleanly

3. **Verify null / invalid schema behavior**
   - `null as record @schema` should produce the same demoted-vs-strict behavior as current record coercion.
   - schema values that do not resolve to a record must preserve the current error shape used by [tests/cases/exceptions/records/dynamic-output-record-not-record/example.mld](./tests/cases/exceptions/records/dynamic-output-record-not-record/example.mld).

4. **Preserve re-coercion semantics**
   - Re-coercing a value with existing schema metadata should re-run coercion and refresh metadata, not no-op.

### Testing

- Extend [interpreter/eval/records/coerce-record.test.ts](./interpreter/eval/records/coerce-record.test.ts) with inline-evaluator parity cases.
- Add regression tests for total failure once `m-bbe8` is fixed.

### Exit Criteria

- [ ] Inline coercion and `=> record @schema` produce the same runtime shape.
- [ ] `m-bbe8` is fixed.
- [ ] Record-resolution errors still match current runtime expectations.

## Phase 4 - Fixtures, Docs, and Changelog (≈0.5-1 day)

**Goal**: Add full user-facing coverage and document the terminal-postfix contract.

### Tasks

1. **Add fixture coverage**
   - Add feature fixtures under [tests/cases/feat/records](./tests/cases/feat/records) for:
     - pipeline-terminal coercion
     - invocation with `with { policy }` before coercion
     - coercion in guard conditions
     - coercion in object/array values
     - parenthesized result access
   - Add exception fixtures for invalid schema resolution where needed.

2. **Add runtime regression coverage**
   - Update:
     - [tests/interpreter/exe-return-structured-metadata.test.ts](./tests/interpreter/exe-return-structured-metadata.test.ts)
     - [tests/interpreter/hooks/guard-post-hook.test.ts](./tests/interpreter/hooks/guard-post-hook.test.ts)
   - Ensure guard code can rely on `mx.schema.valid == false` after inline coercion.

3. **Update user docs**
   - Update:
     - [docs/src/atoms/core/31-records--basics.md](./docs/src/atoms/core/31-records--basics.md)
     - [docs/src/atoms/patterns/05-schema-validation.md](./docs/src/atoms/patterns/05-schema-validation.md)
     - [docs/src/atoms/intro.md](./docs/src/atoms/intro.md) if the summary line should mention inline coercion
   - Document the contract explicitly:
     - terminal postfix
     - producer modifiers before coercion
     - parenthesize to access `.mx` or fields after coercion

4. **Update `CHANGELOG.md`**
   - Add a concise entry for first-class inline dynamic record coercion.

### Testing

- Run:
  - `npm run build:grammar`
  - `npm run build:fixtures`
  - targeted vitest for grammar, records, metadata, and guard suites
  - `npm test`
  - `npm run build`

### Exit Criteria

- [ ] Fixtures cover the main supported forms.
- [ ] Atom docs describe the final syntax contract.
- [ ] `CHANGELOG.md` is updated.
- [ ] Full test/build gates pass.

## Validation Matrix

The implementation is not done until all of these are true:

- [ ] `@raw | @parse.llm as record @contract` works
- [ ] `run ... using auth:x with { ... } as record @schema` works
- [ ] `@worker(@task) with { ... } as record @schema` works
- [ ] `@fn(@value as record @schema)` works in argument position
- [ ] `{ payload: @value as record @schema }` works in object values
- [ ] `[ @value as record @schema ]` works in array values
- [ ] `(@value as record @schema).mx.schema.valid` works
- [ ] non-record schemas still fail with the existing error shape
- [ ] total failure still exposes `mx.schema.valid == false`
- [ ] `=> record @schema` remains unchanged

## Final Deliverable

The finished feature should let framework code delete wrapper executables whose only purpose was to expose `=> record @schema`, while keeping the language rule simple:

```mlld
<producer> [using ...] [with { ... }] as record <record-valued schema expression>
```

No post-coercion `with`, no post-coercion `using`, no static shorthand, and no chained coercions in the first cut.
