# Context for Meld Grammar Refactoring

*Status: `_dev/PLAN.md` is COMPLETE. Next phase described in `_dev/PLAN-RHS.md`.*

This document provides context and reasoning for the Meld grammar refactoring efforts.

## Background & Problem

*   **Historical Complexity:** The Meld grammar (`core/ast/grammar/meld.pegjs`) and associated pipeline had grown complex. Directives like `@embed` and `@run` became overloaded, handling multiple distinct semantic meanings based on subtle syntax variations. Variable types (`TextVar`, `DataVar`, `PathVar`) required post-processing (`transformVariableNode` in `ParserService`) for downstream compatibility. Directive subtypes were often implicit, pushing complexity downstream.
*   **Previous Attempts (`e2e-fixes-embed`):** Significant effort was previously invested to refactor `@embed` and related issues, but the implementation proved unstable. Valuable conceptual clarity was gained (captured in `-CLARITY.md` documents) but not fully realized in a stable way.
*   **Test State:** E2E tests integrated from `e2e-fixes-embed` initially failed, serving as a specification for the refactor. Many still fail and require updates based on the completed and upcoming AST changes.

## Completed Refactor (`_dev/PLAN.md`)

An incremental refactor of the *existing* `core/ast/grammar/meld.pegjs` grammar (on `consolidate-base`) was undertaken and completed, addressing the root causes identified above.

**Achievements:**

1.  **Consolidated Variable Nodes:** Grammar rules now directly produce a unified `VariableReferenceNode` for all variable types (`{{text}}`, `{{data.field}}`, `$path`), removing the need for the `transformVariableNode` shim.
2.  **Explicit Standalone Directive Subtypes:** Standalone directives (`@run`, `@embed`, `@import`) now include an explicit `subtype` field (e.g., `'runCommand'`, `'embedVariable'`, `'importNamed'`) based on syntax.
3.  **Simplified Grammar:** Test-specific logic using stack trace inspection (`callerInfo`) was removed, and the `validatePath` helper was simplified.
4.  **Removed Parser Shim:** The `transformVariableNode` function was removed from `ParserService`.
5.  **Tests Passing:** All core AST tests (`core/ast`) pass after these changes.

## Next Steps: RHS Consistency (`_dev/PLAN-RHS.md`)

While the previous refactor significantly improved the AST for standalone directives and variable references, an inconsistency remains for `@embed` and `@run` directives used on the **right-hand side (RHS)** of assignments (e.g., `@data x = @embed [...]`).

*   **Problem:** The AST nodes generated for RHS `@embed`/`@run` currently lack the explicit `subtype` field added to their standalone counterparts.
*   **Goal:** Refactor the grammar (`DataValue`, `TextValue` rules, potentially reusing logic via helper rules) to ensure RHS `@embed`/`@run` operations produce an AST node that includes the relevant `subtype`, mirroring the structure of standalone directives for improved consistency and downstream processing.
*   **Plan:** See `_dev/PLAN-RHS.md` for detailed steps.

## Key Considerations & Observations (Still Relevant)

*   **`meld.pegjs` State:** The grammar file, while simplified, remains large. Further modularization (e.g., splitting the file) could be considered in the future but is out of scope for the RHS refactor.
*   **Path Handling:** Path logic (`validatePath`) is crucial and was improved, but careful attention is always needed.
*   **Breaking Changes:** The completed refactor *was* a breaking change for tests, requiring updates. The upcoming RHS refactor will also be a breaking change for parser tests asserting the old RHS structure. E2E tests still require significant updates to align with the new AST.
*   **Long-Term Vision (Issue #14):** These incremental refactors are deliberate steps *towards* the cleaner, more robust grammar and type system envisioned in Issue #14. 