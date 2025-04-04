# Phase 5 Implementation Plan: Interpreter Service & Pipeline Integration

## Context:
- Overall Architecture: @docs/dev/DI-ARCHITECTURE.md
- Pipeline Flow: @docs/dev/PIPELINE.md
- Current AST Structure: @docs/dev/AST.md 
- High-Level Refactoring Plan: @_plans/PLAN-TYPES.md

This plan details the steps for implementing Phase 5 of the type refactoring, focusing on the `InterpreterService` and its integration with other refactored services. It assumes Phases 1-4 (StateService, PathService, ResolutionService, Directive Handlers) are conceptually complete or planned according to `_plans/PLAN-TYPES.md`.

## A. Type Refinement Proposals

**No type refinements proposed for this phase.**

The existing type definitions in `@_spec/types/variables-spec.md` for context objects (`ResolutionContext`, `FormattingContext`) and directive results (`DirectiveReplacement`, `EmbedResult`, `ExecutionResult`, `ImportDirectiveResult`) appear sufficient for this phase. We will proceed with the current specifications.

## B. Detailed Implementation Plan

This plan expands on the Phase 5 punch list from `_plans/PLAN-TYPES.md`.

---

**1. Review `InterpreterService` for Type Alignment:**

*   **Action:** Analyze the current `InterpreterService` implementation (`interpret`, `interpretNode`, `createChildContext`) and its interaction points with other services (`DirectiveService`, `StateService`).
*   **Files:**
    *   `services/pipeline/InterpreterService/InterpreterService.ts`
    *   `services/pipeline/InterpreterService/IInterpreterService.ts`
    *   `core/shared-service-types.ts` (for `DirectiveServiceLike`, `StateServiceLike`)
*   **Details/Considerations:**
    *   Identify all locations where data (nodes, state, context) is passed between `InterpreterService` and other services.
    *   Note current type usage (e.g., `any`, legacy `*Like` types) that will need updating.
    *   Pay attention to how `initialState` and `options` are handled in `interpret`.
*   **Testing:** No specific tests for this review step, but findings will inform subsequent actions.

---

**2. Ensure Correct Creation and Passing of Context Objects:**

*   **Action:** Update `InterpreterService` to correctly create, populate, and pass the strictly typed context objects (`ResolutionContext`, `FormattingContext`, `ExecutionContext`, `PathResolutionContext`) as defined in the specs (`@_spec/types/variables-spec.md`, `@_spec/types/run-spec.md`) when calling other services (particularly `DirectiveService` handlers via `callDirectiveHandleDirective`).
*   **Files:**
    *   `services/pipeline/InterpreterService/InterpreterService.ts`
*   **Details/Considerations:**
    *   The context passed to `callDirectiveHandleDirective` currently uses `any`. Refactor this to pass a structured context object containing the relevant typed sub-contexts.
    *   Ensure `ExecutionContext` (from `run-spec.md`) is correctly populated for `@run` directives.
    *   Ensure `ResolutionContext` and `PathResolutionContext` (from `variables-spec.md`) are constructed with appropriate flags and base paths derived from the current `StateServiceLike` and `InterpreterOptions`.
    *   Ensure `FormattingContext` (from `variables-spec.md`) is initialized and potentially updated based on directive results (as hinted in the current code).
    *   **Consider using dedicated factories or helper functions** (potentially defined alongside the context types in `core/types/`) for creating and modifying these context objects consistently.
    *   This may involve updating the `DirectiveService` interface (`IDirectiveServiceClient`) and its handlers (Phase 4 work) to *expect* these typed context objects instead of a generic `context: any`. Coordinate with Phase 4 implementation.
*   **Testing:**
    *   Update unit tests in `services/pipeline/InterpreterService/InterpreterService.unit.test.ts` to verify that the correct context objects with expected properties are passed during `callDirectiveHandleDirective`.
    *   Mock `DirectiveService` handlers to check the structure and types of the received context.

---

**3. Verify Type Compatibility Between Service Calls:**

*   **Action:** Ensure type signatures align across the main pipeline flow involving `InterpreterService`:
    *   `ParserService` output (`MeldNode[]`) matches `InterpreterService.interpret` input.
    *   `InterpreterService` calls to `DirectiveService.handleDirective` use the correct node types (`DirectiveNode`) and expect compatible return types (likely the updated `StateServiceLike` or a specific `DirectiveResult` type from Phase 4).
    *   `InterpreterService` interactions with `StateService` (`createChildState`, `clone`, `mergeChildState`) use the strictly typed `IStateService` interface (from Phase 1).
*   **Files:**
    *   `services/pipeline/InterpreterService/InterpreterService.ts`
    *   `services/pipeline/InterpreterService/IInterpreterService.ts`
    *   `services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.ts` (and potentially handler interfaces)
    *   `services/state/StateService/IStateService.ts`
    *   `services/pipeline/ParserService/IParserService.ts` (verify output type)
    *   Potentially `core/pipeline.ts` or other entry points where services are connected.
*   **Details/Considerations:**
    *   Replace legacy `*Like` types (`StateServiceLike`, `DirectiveServiceLike`) with the actual strict interfaces (`IStateService`, `IDirectiveServiceClient`) where appropriate within `InterpreterService`.
    *   The return type of `callDirectiveHandleDirective` needs careful handling. Directive handlers (Phase 4) might return the updated `IStateService` directly or a wrapper object (like `DirectiveResult`) containing the state and potentially replacement nodes/values. The `InterpreterService` needs to handle whichever pattern is adopted in Phase 4. The current code anticipates a potential `{ replacement: MeldNode; state: StateServiceLike; }` structure.
*   **Testing:**
    *   Update integration tests that cover the flow from parsing through interpretation to verify type compatibility across service boundaries.
    *   Ensure mocks used in `InterpreterService.unit.test.ts` adhere to the strict service interfaces.

---

**4. Ensure Correct Handling of Transformation Results and SourceLocation:**

*   **Action:** Refine the logic within `InterpreterService.interpretNode` that handles directive results during transformation mode. Ensure it correctly applies replacements and preserves or updates `SourceLocation` information.
*   **Files:**
    *   `services/pipeline/InterpreterService/InterpreterService.ts`
*   **Details/Considerations:**
    *   **Non-destructive Transformations:** The current logic uses `state.clone()` before processing a node and `currentState.transformNode(node, replacement)` to apply changes. Verify this aligns with the final `IStateService` design (Phase 1) for managing original vs. transformed nodes non-destructively. Ensure variable state (`textVars`, `dataVars`, etc.) is also handled correctly during transformations (e.g., ensuring imported variables in transformation mode land in the correct state, as attempted in the current code). The `StateVariableCopier` usage needs review against the final `IStateService` implementation.
    *   **SourceLocation Tracking:**
        *   The current `InterpreterService` does not explicitly manipulate `SourceLocation` during transformation.
        *   **Requirement:** When a directive handler (Phase 4) provides a replacement node (or nodes), the `InterpreterService` (or potentially the `StateService.transformNode` method) must ensure the replacement node(s) have appropriate `SourceLocation` information.
        *   **Strategy:**
            1.  **Default:** Replacement nodes should ideally inherit the `SourceLocation` of the original directive node they are replacing.
            2.  **Refinement (Phase 4):** Directive handlers *could* be designed to return replacement nodes with more precise `SourceLocation`s if the replacement corresponds directly to a specific part of the *original* source that generated the directive's output (e.g., the content of an embedded file). This would require directive result types (defined in Phase 4) to optionally include refined location info alongside replacement nodes.
            3.  **Implementation:** The `InterpreterService` should primarily ensure *some* valid `SourceLocation` exists on replacement nodes, defaulting to the original directive's location unless the `DirectiveResult` provides a more specific one. The `StateService.transformNode` implementation will be key here.
*   **Testing:**
    *   Add unit tests in `InterpreterService.unit.test.ts` specifically for transformation mode.
        *   Test scenarios where directives return replacement nodes.
        *   Verify that `state.transformNode` is called correctly.
        *   Verify the `SourceLocation` of the nodes in the `transformedNodes` array after replacement.
    *   Add integration tests verifying that end-to-end transformations maintain source map integrity (if applicable to the output format).

---

**5. Update Related Integration Tests:**

*   **Action:** Review and update any integration tests that rely on the `InterpreterService` or test the overall pipeline flow, ensuring they align with the new types and behaviors.
*   **Files:**
    *   `tests/services/pipeline/integration/...` (any relevant integration tests)
    *   `api/api.test.ts` (if it tests interpretation)
*   **Details/Considerations:**
    *   Update test setup to use the strictly typed services.
    *   Adjust assertions to expect strictly typed results or state configurations.
    *   Focus on tests involving imports, embeds, and runs, especially in transformation mode.
*   **Testing:** This action *is* the testing step for integration.

--- 