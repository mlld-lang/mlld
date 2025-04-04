# Plan: Phase 3 - Resolution Service Refactor

## Context:
- Overall Architecture: docs/dev/DI-ARCHITECTURE.md
- Pipeline Flow: docs/dev/PIPELINE.md

*   **High-Level Plan:** `_plans/PLAN-TYPES.md`
*   **Relevant Specs:** `_spec/types/variables-spec.md` (esp. `MeldVariable`, `ResolutionContext`, `VariableReferenceNode`), `_spec/types/import-spec.md` (esp. `MeldPath`)
*   **AST:** `docs/dev/AST.md` (esp. `VariableReferenceNode`)
*   **Code:** `services/resolution/ResolutionService/*`, `services/resolution/IResolutionService.ts`
*   **Assumptions:** Phase 1 (`StateService`) and Phase 2 (`PathService`) refactors are complete or planned, providing strictly typed inputs/outputs.

## A. Type Refinement Proposals

No type refinements are proposed for this phase. The existing definitions in `_spec/types/variables-spec.md` for `ResolutionContext` and related types appear sufficient.

## B. Detailed Implementation Plan

This plan details the steps to refactor `ResolutionService` and its components to use the updated AST (`VariableReferenceNode`) and strict types (`MeldVariable`, `MeldPath`, `ResolutionContext`).

### 1. Refactor `IResolutionService` Interface (`services/resolution/ResolutionService/IResolutionService.ts`)

*   **Action:** Update method signatures to use the new strict types.
    *   Modify `resolveText`, `resolveData`, `resolvePath`, `resolveCommand`, `resolveContent`, `resolveInContext`, `resolveFieldAccess`, `validateResolution` methods to accept the standardized `ResolutionContext` object instead of disparate context parameters.
    *   Update return types where necessary to reflect strict types (e.g., `resolvePath` might return a specific `MeldPath` subtype if applicable, though string is likely still appropriate for the public interface).
    *   Remove redundant or outdated context fields from the old `ResolutionContext` definition (e.g., `allowedVariableTypes`, `pathValidation` as these are now within the spec's `ResolutionContext`).
*   **Files:** `services/resolution/ResolutionService/IResolutionService.ts`
*   **Details/Considerations:**
    *   Ensure the interface aligns with the type definitions in `_spec/types/variables-spec.md`.
    *   The `StateServiceLike` import might need adjustment if `IStateService` itself was refactored in Phase 1.
    *   Deprecate or remove methods if their functionality is fully subsumed by `resolveInContext` or `resolveVariables` combined with `ResolutionContext`.
*   **Testing:** No direct tests for the interface, but dependent implementation tests will cover changes.

### 2. Refactor `ResolutionService` Implementation (`services/resolution/ResolutionService/ResolutionService.ts`)

*   **Action:** Update the core `ResolutionService` logic.
    *   Modify method implementations (`resolveText`, `resolveData`, etc.) to accept and utilize the standardized `ResolutionContext` object.
    *   Adapt logic to read flags and settings from the `ResolutionContext` (e.g., `context.strict`, `context.flags.isTransformation`, `context.allowedVariableTypes`).
    *   Update calls to `StateService` methods (`getTextVar`, `getDataVar`, `getPathVar`, etc.) to expect the strict `MeldVariable` types defined in Phase 1. Handle the typed results appropriately (e.g., accessing `.value`).
    *   Update calls to `PathService` methods to use and expect strict `MeldPath` types as defined in Phase 2.
    *   Refactor `resolveVariables` (or equivalent internal method) to handle the unified `VariableReferenceNode` AST node. Use `node.valueType` to determine the primary resolution path (text, data, path) and call the appropriate internal resolver or logic.
    *   Refactor field access logic (`resolveFieldAccess`, potentially internal helpers in `VariableReferenceResolver`) to operate on the strictly typed `DataVariable` from `StateService` and handle the `fields` array from `VariableReferenceNode`.
    *   Ensure `ResolutionContext` is properly instantiated (likely via a factory or helper) and propagated through internal calls, incrementing depth (`context.withIncreasedDepth()`) for recursion/nesting control. Consider creating/using a dedicated `ResolutionContextFactory` or helper functions for consistent context creation and modification.
    *   Update internal helper methods and potentially delegate more specific logic to sub-resolvers (`TextResolver`, `DataResolver`, `PathResolver`, `VariableReferenceResolver`).
*   **Files:**
    *   `services/resolution/ResolutionService/ResolutionService.ts`
    *   `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.ts` (major changes likely here)
    *   `services/resolution/ResolutionService/resolvers/TextResolver.ts`
    *   `services/resolution/ResolutionService/resolvers/DataResolver.ts`
    *   `services/resolution/ResolutionService/resolvers/PathResolver.ts`
    *   `services/resolution/ResolutionService/resolvers/CommandResolver.ts`
    *   `services/resolution/ResolutionService/resolvers/ContentResolver.ts`
    *   Potentially `services/resolution/ResolutionService/ResolutionContextFactory.ts` (if it exists/is created)
*   **Details/Considerations:**
    *   The `VariableReferenceResolver` will need significant updates to use the `VariableReferenceNode` structure instead of relying on regex or separate parsing logic. It should use `node.identifier` and `node.fields` for lookups via `StateService` and field access.
    *   Path resolution logic (in `PathResolver` or `ResolutionService`) should correctly interpret `VariableReferenceNode` with `valueType: 'path'`, including handling `isSpecial` flags.
    *   Error handling (`MeldResolutionError`) should be updated to use codes and details consistent with the new structure and context.
    *   Pay attention to how the `ResolutionContext` flags (e.g., `isVariableEmbed`, `isTransformation`) influence behavior in different resolution paths.
    *   Ensure interaction with the ParserService client/interface remains compatible or update as needed (though ParserService changes are mostly outside this phase).
*   **Testing:** See step 3.

### 3. Update Unit Tests (`services/resolution/ResolutionService/ResolutionService.test.ts` and sub-resolver tests)

*   **Action:** Adapt existing tests and add new ones to cover the refactored logic and types.
    *   Update test setup to provide mock `StateService` and `PathService` that return the new strict `MeldVariable` and `MeldPath` types.
    *   Update test cases to pass the new `ResolutionContext` object to `ResolutionService` methods.
    *   Modify assertions to check for expected outcomes based on the new types and logic.
    *   Add tests specifically for the handling of `VariableReferenceNode` with different `valueType` values ('text', 'data', 'path').
    *   Add tests for data variable field access using `VariableReferenceNode.fields`.
    *   Add tests verifying the behavior of different `ResolutionContext` flags (strict mode, transformation, allowed types, etc.).
    *   Add tests for error conditions (e.g., variable not found, invalid field access, max depth exceeded) using the new context and types.
    *   Ensure tests for `VariableReferenceResolver` and other sub-resolvers are updated similarly.
*   **Files:**
    *   `services/resolution/ResolutionService/ResolutionService.test.ts`
    *   `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts`
    *   `services/resolution/ResolutionService/resolvers/TextResolver.test.ts`
    *   `services/resolution/ResolutionService/resolvers/DataResolver.test.ts`
    *   `services/resolution/ResolutionService/resolvers/PathResolver.test.ts`
    *   `services/resolution/ResolutionService/resolvers/CommandResolver.test.ts`
    *   `services/resolution/ResolutionService/resolvers/ContentResolver.test.ts`
*   **Details/Considerations:**
    *   Leverage test context helpers (`TestContextDI`) for managing dependencies and mocks effectively.
    *   Ensure coverage for edge cases, including nested resolutions and interactions between different variable types. 