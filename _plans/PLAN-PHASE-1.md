# Meld Refactoring: Phase 1 Detailed Plan - Foundational Types & StateService

## Context:
- Overall Architecture: docs/dev/DI-ARCHITECTURE.md
- Pipeline Flow: docs/dev/PIPELINE.md
- Current AST Structure: docs/dev/AST.md 
- High-Level Refactoring Plan: _plans/PLAN-TYPES.md

## A. Type Refinement Proposals

Based on the review of the **revised** `_spec/types/variables-spec.md` and the existing `StateService` implementation (`services/state/StateService/StateService.ts`, `IStateService.ts`), the proposed types incorporating refined Path/URL and Command variables appear robust and well-aligned with the objectives and the AST (`docs/dev/AST.md`).

**The revised specification in `@_spec/types/variables-spec.md` will be used as the basis for implementation.** We will consolidate these types into `core/types/variables.ts`.

## B. Detailed Implementation Plan

This plan expands on the Phase 1 punch list from `_plans/PLAN-TYPES.md`, using the **latest revised types**.

**Objective:** Introduce strict types for Meld variables (including refined Path/URL and Command variables) and refactor StateService to manage them. **Centralize all core type definitions.**

**Current Status:** Items 1 and 2 are complete. Item 3 is the next step.

---

**[COMPLETED] Punch List Item 1:** Define **and centralize** core variable **and directive** types based on the **revised** `_spec/types/*.md` in `core/types/*`.

*   **Action:** Create/Update files in `core/types/` to hold all core type definitions from the specs.
*   **Files:** 
    *   `core/types/variables.ts` (New or Update)
    *   `core/types/paths.ts` (New or Update - See Phase 2 for path specifics)
    *   `core/types/define.ts` (New or Update)
    *   `core/types/state.ts` (New)
    *   `core/types/resolution.ts` (New)
    *   `core/types/common.ts` (New)
    *   `core/types/index.ts` (Update for exports)
    // *   `core/types/embed.ts` (To be created)
    // *   `core/types/run.ts` (To be created)
    // *   `core/types/import.ts` (To be created)
*   **Details/Considerations:**
    *   Copied relevant type definitions from the **latest version** of `_spec/types/variables-spec.md` and other implicit definitions into these files.
    *   Ensured necessary imports between these new type files.
    *   Added/Updated JSDoc comments.
    *   Resolved linter errors in `core/types/index.ts`.
*   **Testing:** Compilation checks passed after fixes.

---

**[COMPLETED] Punch List Item 2:** Refactor `IStateService` interface methods to use/return these strict, **revised** types.

*   **Action:** Modify method signatures in `IStateService`.
*   **Files:** `services/state/StateService/IStateService.ts`
*   **Details/Considerations:**
    *   Updated `getTextVar` return type to `TextVariable | undefined`.
    *   Updated `setTextVar` signature: `setTextVar(name: string, value: string, metadata?: Partial<VariableMetadata>): TextVariable;`.
    *   Updated `getDataVar` return type to `DataVariable | undefined`.
    *   Updated `setDataVar` signature: `setDataVar(name: string, value: JsonValue, metadata?: Partial<VariableMetadata>): DataVariable;`.
    *   Updated `getPathVar` return type to **`IPathVariable | undefined`**.
    *   Updated `setPathVar` signature: **`setPathVar(name: string, value: IFilesystemPathState | IUrlPathState, metadata?: Partial<VariableMetadata>): IPathVariable;`** (Accepts the union state).
    *   Updated `getCommandVar` return type to **`CommandVariable | undefined`**.
    *   Updated `setCommandVar` signature: **`setCommandVar(name: string, value: ICommandDefinition, metadata?: Partial<VariableMetadata>): CommandVariable;`** (Accepts the structured definition).
    *   Added/Updated generic `getVariable`, `setVariable`, `hasVariable`, `removeVariable`.
    *   Updated `getAllTextVars` return type to `Map<string, TextVariable>`.
    *   Updated `getAllDataVars` return type to `Map<string, DataVariable>`.
    *   Updated `getAllPathVars` return type to **`Map<string, IPathVariable>`**.
    *   Updated `getAllCommands` return type to **`Map<string, CommandVariable>`**.
    *   Updated `getLocal*Vars` similarly.
    *   Renamed original `getNodes` to `getOriginalNodes`.
    *   Updated other method signatures (`createChildState`, transformation methods, etc.) based on `core/types/state.ts`.
    *   Added imports for the **revised** types from `core/types/`.
*   **Testing:** No direct tests, but dependent tests will fail (expected).

---

**Punch List Item 3 (Revised): Refactor `StateService` implementation.**

*   **Overall Action:** Update internal storage, method implementations, cloning logic, and type handling using **revised types**. Resolve type mismatches highlighted by the linter against the updated `IStateService` interface.
*   **Files:** `services/state/StateService/StateService.ts`, `services/state/StateService/types.ts`, `services/state/StateService/StateFactory.ts`

*   **Sub-Item 3a: Update `StateNode` Definition:**
    *   **Action:** Modify the `StateNode` interface in `services/state/StateService/types.ts`.
    *   **Details:**
        *   Change `variables.text: Map<string, string>` to `variables.text: Map<string, TextVariable>`.
        *   Change `variables.data: Map<string, unknown>` to `variables.data: Map<string, DataVariable>`.
        *   Change `variables.path: Map<string, string>` to `variables.path: Map<string, IPathVariable>`.
        *   Change `variables.commands: Map<string, CommandDefinition>` to `variables.commands: Map<string, CommandVariable>`.
        *   Import necessary types from `core/types/`.

*   **Sub-Item 3b: Add `lodash` Dependency:**
    *   **Action:** Add `lodash` (or specifically `lodash.cloneDeep`) as a project dependency.
    *   **Details:** Run `npm install lodash @types/lodash` or equivalent. This is a prerequisite for the deep cloning required in 3c.

*   **Sub-Item 3c: Refactor `StateFactory.createClonedState` for Deep Cloning:**
    *   **Action:** Modify the `createClonedState` method in `services/state/StateService/StateFactory.ts`.
    *   **Details:**
        *   **Implement deep cloning using `lodash.cloneDeep`**. Focus on correctly cloning the entire `currentState` object passed to it.
        *   Pay special attention to the nested structures within `IPathVariable.value` (which is a union `IFilesystemPathState | IUrlPathState`) and `CommandVariable.value` (`ICommandDefinition`).
        *   **The existing `StateVariableCopier` utility is NOT suitable for this deep cloning task.**
        *   Ensure the new state gets a unique `stateId`.
    *   **Testing:** Add or update unit tests specifically for `StateFactory.createClonedState` to verify deep cloning behavior, especially for path and command variables. Ensure modifications to the cloned state *do not* affect the original.

*   **Sub-Item 3d: Investigate & Resolve Type Casting Issues:**
    *   **Action:** Analyze and fix the root causes of `Conversion of type 'IStateService' to type 'StateService' may be a mistake...` errors in `StateService.ts`.
    *   **Files:** `services/state/StateService/StateService.ts` (specifically in methods like `initializeState`, `createChildState`, `mergeChildState`).
    *   **Details:**
        *   Avoid relying on `parentState as StateService`. Determine why the type mismatch occurs.
        *   This might involve ensuring `StateService` fully implements all relevant parts of `IStateService` used internally, adjusting constructor logic, or modifying how parent state information is passed and accessed.

*   **Sub-Item 3e: Update `StateService` Read Methods:**
    *   **Action:** Refactor getter methods in `StateService.ts`.
    *   **Details:**
        *   Update `getTextVar`, `getDataVar`, `getPathVar`, `getCommandVar` to read from the updated `StateNode` maps and return the full typed variable objects (`TextVariable`, `DataVariable`, `IPathVariable`, `CommandVariable`) or `undefined`, matching the `IStateService` signatures.
        *   Update `getAllTextVars`, `getAllDataVars`, `getAllPathVars`, `getAllCommands` to return maps with the correct typed variable objects as values.
        *   Update `getLocalTextVars`, `getLocalDataVars`, etc. similarly.
        *   Resolve associated type errors.

*   **Sub-Item 3f: Update `StateService` Write Methods (`set*Var`):**
    *   **Action:** Refactor setter methods in `StateService.ts`.
    *   **Details:**
        *   Update `setTextVar`, `setDataVar`, `setPathVar`, `setCommandVar`.
        *   These methods must now:
            *   Accept the correct input types as defined in `IStateService` (e.g., `IFilesystemPathState | IUrlPathState` for `setPathVar`, `ICommandDefinition` for `setCommandVar`).
            *   **Construct the full, appropriate typed variable object** (`TextVariable`, `DataVariable`, `IPathVariable`, `CommandVariable`).
            *   **Populate standard metadata** (ensure `createdAt`, `modifiedAt`, `origin` are set correctly). Handle potentially passed-in `metadata` (like `definedAt`).
            *   Store the complete typed object in the corresponding map within `currentState.variables`.
            *   **Return the created typed variable object**, matching the `IStateService` return signatures.
        *   Resolve associated type errors.

*   **Sub-Item 3g: Implement/Update Generic Variable Methods:**
    *   **Action:** Implement or refactor the generic variable handling methods in `StateService.ts`.
    *   **Details:**
        *   Update `getVariable`, `setVariable`, `hasVariable`, `removeVariable`.
        *   These should correctly handle the different `VariableType` enum values and delegate to or reuse logic from the type-specific methods (from 3e, 3f).
        *   Ensure they align with the `IStateService` signatures.
        *   Resolve associated type errors.

*   **Sub-Item 3h: Refactor `StateService.clone()`:**
    *   **Action:** Update the `clone` method in `StateService.ts`.
    *   **Details:**
        *   Modify the `clone` method to call the refactored `StateFactory.createClonedState` (from 3c) to perform the deep clone.
        *   Ensure the rest of the `clone` method logic (copying transformation settings, tracking relationships) remains correct and uses the properties of the newly cloned state.

*   **Sub-Item 3i: Update Internal Imports & Final Type Checks:**
    *   **Action:** Finalize imports and type checking within the refactored file.
    *   **Details:**
        *   Ensure all necessary types from `core/types/` are correctly imported in `StateService.ts`, `StateFactory.ts`, and `types.ts`.
        *   Remove unused imports.
        *   Run the TypeScript compiler/linter focused on these files to catch any remaining type errors within them.

*   **Testing:** Requires significant updates to `services/state/StateService.test.ts` (See Item 4). Tests for `StateFactory.createClonedState` should be updated/added as part of Sub-Item 3c.

---

**Punch List Item 4:** Update existing `StateService` unit tests.

*   **Action:** Modify test cases to reflect the new **revised** typed interface and behavior.
*   **Files:** `services/state/StateService/StateService.test.ts`, potentially `StateFactory.test.ts`
*   **Details/Considerations:**
    *   Update assertions to expect the full, **revised** variable objects (`TextVariable`, `DataVariable`, `IPathVariable`, `CommandVariable`), including metadata checks.
    *   Verify properties within `IPathVariable.value` (checking `contentType` and relevant fields for both FS and URL states).
    *   Verify properties within `CommandVariable.value` (checking `type` and relevant fields of the stored `ICommandDefinition`).
    *   Update tests for `set*Var` methods to check the returned typed object.
    *   Add tests for generic methods (`getVariable`, `setVariable`, `hasVariable`, `removeVariable`).
    *   **Crucially, update `clone()` tests:** Verify deep copying **performed by `lodash.cloneDeep` within `StateFactory.createClonedState`** for the **new structures** within `IPathVariable` and `CommandVariable`. Ensure modifications to the clone do not affect the original.
    *   Update state inheritance tests (`createChildState`).
*   **Testing:** Run all state tests.

---

**Next Step:** Proceed with **Sub-Item 3a**, updating the `StateNode` interface in `services/state/StateService/types.ts`. 