# Refactor meld.pegjs Grammar for RHS Consistency (@embed/@run)

*Status: Not Started*

## Introduction & Background

Following the successful completion of `_dev/PLAN.md` (which consolidated variable types, added subtypes to standalone directives, and removed parser shims/`callerInfo`), we identified an area for further consistency improvement in the Meld grammar (`core/ast/grammar/meld.pegjs`).

Currently, when `@embed` or `@run` directives appear on the **right-hand side (RHS)** of assignment directives (`@data = ...`, `@text = ...`), the resulting AST node structure lacks the explicit `subtype` field that we added to their standalone counterparts. This inconsistency complicates downstream processing and typing.

For example:
*   `@data x = @embed [...]` produces `{ source: "embed", value: { kind: "embed", path: ... } }` (missing `subtype` in `value`)
*   Standalone `@embed [...]` produces `{ type: 'Directive', directive: { kind: 'embed', subtype: 'embedPath', path: ... } }` (includes `subtype`)

This plan outlines refactoring the grammar to ensure RHS `@embed` and `@run` operations produce a consistent and expressive AST node structure, including the relevant `subtype`.

## Goal

Modify the **existing** `core/ast/grammar/meld.pegjs` file to:

1.  **Add Subtypes to RHS `@embed`/`@run`:** Modify the `DataValue` and `TextValue` rules to parse RHS `@embed` and `@run` directives, determine their specific subtype (e.g., `'embedPath'`, `'runCommand'`), and include this subtype in the resulting AST node.
2.  **Standardize RHS AST Structure:** Ensure the object representing the RHS `@embed` or `@run` operation within the `@data`/`@text` directive node has a clear and consistent structure that includes the `subtype` and relevant details (path, command, content, etc.).
3.  **Centralize Parsing Logic (DRY):** Refactor the grammar to use shared internal helper rules (e.g., `EmbedRHS`, `RunRHS`) for parsing the different syntactic forms of `@embed` and `@run` and determining their subtypes, avoiding redundant logic between RHS rules and standalone directive rules.
4.  **Ensure Consistency:** Update the standalone `EmbedDirective` and `RunDirective` rules to leverage the same internal helper rules used for RHS parsing, ensuring maximum consistency across the grammar.

## Rationale & Motivation

*   **AST Consistency:** Creates a uniform AST representation for `@embed` and `@run` operations, regardless of whether they are standalone or on the RHS of an assignment.
*   **Simplify Downstream Logic:** Provides directive handlers for `@data` and `@text` with explicit `subtype` information, making it easier and safer to determine *how* to execute the RHS operation to get the variable's value.
*   **Improve Type Safety:** Lays the foundation for stricter TypeScript typing in directive handlers, allowing them to discriminate based on the `subtype`.
*   **Enhance Maintainability:** Centralizes parsing logic for `@embed`/`@run` subtypes, making the grammar easier to understand and modify (DRY principle).

## Relationship to Other Issues

*   **Builds on `_dev/PLAN.md`:** Directly follows the previous grammar refactor by extending subtype consistency to RHS contexts.
*   **Supports Type Implementation (Issue #14):** Provides a more expressive AST that facilitates the implementation of stricter downstream TypeScript types.

## Proposed Changes in `core/ast/grammar/meld.pegjs`

1.  **Create Helper Rule `EmbedRHS`:**
    *   Define a new internal rule (e.g., `EmbedRHS`) that parses the content following `@embed` when used on the RHS.
    *   This rule should have alternatives to distinguish between path (`[...]`), variable (`{{...}}`), and template (`[[...]]`) forms.
    *   It should return a standardized object containing the `subtype` ('embedPath', 'embedVariable', 'embedTemplate') and associated data (e.g., `{ subtype: 'embedPath', path: validatePath(...) }`, `{ subtype: 'embedTemplate', content: '...' }`).
    *   It should *not* return the `source: "embed"` field; that will be added by the calling rule (`DataValue`/`TextValue`).

2.  **Create Helper Rule `RunRHS`:**
    *   Define a new internal rule (e.g., `RunRHS`) that parses the content following `@run` when used on the RHS.
    *   This rule should have alternatives to distinguish between command reference (`$...`), code (`[[...]]`), code with params (`lang (...) [[...]]`), and simple command (`[...]`) forms.
    *   It should return a standardized object containing the `subtype` ('runDefined', 'runCode', 'runCodeParams', 'runCommand') and associated data (e.g., `{ subtype: 'runDefined', command: { name: ..., args: ...} }`, `{ subtype: 'runCode', command: '...', language: '...' }`).
    *   It should *not* return the `source: "run"` field.

3.  **Refactor `DataValue`:**
    *   Modify the `@embed` alternative to call `EmbedRHS`. The result should be structured like `{ source: 'embed', embed: <result_from_EmbedRHS> }`.
    *   Modify the `@run` alternative to call `RunRHS`. The result should be structured like `{ source: 'run', run: <result_from_RunRHS> }`.
    *   Ensure `@call` and literal alternatives remain consistent (likely no changes needed there).

4.  **Refactor `TextValue`:**
    *   Modify the `@embed` alternative to call `EmbedRHS`. The result should be structured like `{ source: 'embed', embed: <result_from_EmbedRHS> }`.
    *   Modify the `@run` alternative to call `RunRHS`. The result should be structured like `{ source: 'run', run: <result_from_RunRHS> }`.
    *   Ensure `@call` and literal alternatives remain consistent.

5.  **Refactor `EmbedDirective` (Standalone):**
    *   Update the rule to call the `EmbedRHS` helper rule internally.
    *   Adjust the final `createDirective` call to correctly package the result from `EmbedRHS` along with the top-level `kind: 'embed'` and the already-added `subtype` from the helper.

6.  **Refactor `RunDirective` (Standalone):**
    *   Update the rule to call the `RunRHS` helper rule internally.
    *   Adjust the final `createDirective` call to correctly package the result from `RunRHS` along with the top-level `kind: 'run'` and the already-added `subtype` from the helper.

## Scope

*   **IN SCOPE:** Modifying `core/ast/grammar/meld.pegjs` as described (creating helper rules, refactoring `DataValue`, `TextValue`, `EmbedDirective`, `RunDirective`). Updating affected parser tests.
*   **OUT OF SCOPE (for this task):** Modifying downstream directive handlers (`DataDirectiveHandler`, `TextDirectiveHandler`) to *use* the new subtype information. Fixing E2E tests. Physically splitting the grammar file.

## Impact

*   The AST structure for `@data = @embed...`, `@data = @run...`, `@text = @embed...`, `@text = @run...` will change to include the `subtype`.
*   Grammar logic for parsing `@embed` and `@run` subtypes will be centralized and potentially simplified.
*   **BREAKING CHANGE:** Parser tests asserting the specific structure of RHS `@embed`/`@run` values will need updates. Downstream code relying on the *old* RHS structure might break (though the primary consumers are the directive handlers, which are out of scope for modification in *this* plan).

## Testing Strategy

*   Modify existing parser tests (`core/ast/tests/parser.test.ts`) for `@data` and `@text` directives to assert the new RHS structure, including the `subtype` field within the nested `embed` or `run` object.
*   Add new parser tests specifically covering different RHS `@embed` and `@run` subtype variations for both `@data` and `@text`.
*   Run all core AST tests (`npm test core/ast`) to ensure the refactoring of standalone `EmbedDirective` and `RunDirective` doesn't introduce regressions.

## Relevant Files

*   `core/ast/grammar/meld.pegjs` (Primary file to modify)
*   `core/ast/tests/parser.test.ts` (Test updates)
*   Potentially `core/ast/tests/directives/data.test.ts` and `core/ast/tests/directives/text.test.ts` (Test updates)
