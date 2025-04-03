# Context for Grammar Refactor Plan (PLAN.md)

This document provides context and reasoning for the incremental grammar refactor outlined in `_dev/PLAN.md`.

## Background & Problem

*   **Historical Complexity:** The Meld grammar (`core/ast/grammar/meld.pegjs`) and associated pipeline have grown complex over time. Directives like `@embed` and `@run` became overloaded, handling multiple distinct semantic meanings based on subtle syntax variations.
*   **Variable Types:** The parser originally produced distinct AST nodes for different variable types (`TextVar`, `DataVar`, `PathVar`), requiring a post-processing step (`transformVariableNode` in `ParserService`) to unify them into the `VariableReference` type expected downstream.
*   **Implicit Subtypes:** Directive subtypes (e.g., distinguishing `@embed [path]` vs. `@embed {{variable}}`) were often determined implicitly within directive handlers later in the pipeline, making the initial AST less informative and pushing complexity downstream.
*   **Previous Attempts (`e2e-fixes-embed`):** Significant effort was previously invested (on the `e2e-fixes-embed` branch) to refactor `@embed` and address related issues like variable path prefixing. While conceptual progress was made (captured in `_dev/EMBED-CLARITY.md`, `_dev/RUN-CLARITY.md`) and new E2E tests were added, the implementation on that branch proved unstable, with many failing tests (including regressions) and incomplete architectural changes (e.g., the `resolveVariablesInOutput` feature flag).
*   **Test State:** Tests on `e2e-fixes-embed`, while numerous, were largely failing. Tests on `new-urlservice` pass, but achieve this partly by skipping core E2E suites, potentially masking issues.

## Chosen Approach: Incremental Grammar Refactor

We decided *not* to directly merge or salvage the implementation from `e2e-fixes-embed` due to its instability. Instead, we are pursuing an incremental refactor of the *existing* `core/ast/grammar/meld.pegjs` file on the `consolidate-base` branch.

**Rationale:**

*   **Leverage Learnings:** This approach uses the valuable conceptual clarity gained from the `e2e-fixes-embed` effort (specifically the `-CLARITY.md` documents) to guide the refactor.
*   **Address Root Cause:** Modifying the grammar directly addresses the root cause of the complexity – the lack of explicit variable type consolidation and directive subtyping at the source (parser).
*   **Pragmatism:** It avoids the larger undertaking of implementing the full dual-grammar system proposed in Issue #14, delivering significant improvements sooner.
*   **Stability:** Working on `consolidate-base` provides a more stable foundation than the `e2e-fixes-embed` branch.
*   **Test-Driven:** We have integrated the E2E tests from `e2e-fixes-embed` into `consolidate-base` to serve as a clear specification and guide for the refactor. These tests are expected to fail initially.

## Key Considerations & Observations

*   **`meld.pegjs` State:** The current grammar file contains significant test-specific logic (especially in `validatePath` using stack traces) that complicates understanding and maintenance. The refactor plan includes simplifying this opportunistically.
*   **Path Handling:** Cleaning up `validatePath` is important as path logic is crucial for `@embed` and `@import`.
*   **Breaking Change:** This refactor *is* a breaking change for tests and potentially downstream code that relies on the old AST structure (specific variable types, implicit subtypes). Test updates are a necessary part of the work.
*   **Long-Term Vision (Issue #14):** While this plan defers the full `meld-strict.pegjs` implementation, it's a deliberate step *towards* that vision.

## Next Steps (as per `_dev/PLAN.md`)

1.  Begin modifying `core/ast/grammar/meld.pegjs`, starting with the variable rules (`TextVar`, `DataVar`, `PathVar`) to produce unified `VariableReference` nodes.
2.  Update parser tests (`core/ast/tests/parser.test.ts`) to reflect the new expected AST structure for variables.
3.  Proceed with adding explicit `subtype` fields for `@run`, `@embed`, and `@import` rules in the grammar and update relevant tests.
4.  Refactor/simplify `validatePath`.
5.  Remove the `transformVariableNode` shim from `ParserService`.
6.  Continuously run tests (`TestContextDI`, E2E tests) to validate progress and catch regressions. 