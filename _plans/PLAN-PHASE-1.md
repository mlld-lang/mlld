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

*   **[COMPLETED] Sub-Item 3a: Update `StateNode` Definition:**
    *   **Action:** Modify the `StateNode` interface in `services/state/StateService/types.ts`.
    *   **Details:** Updated variable maps (`text`, `data`, `path`, `commands`) to use the new rich variable types (`TextVariable`, `DataVariable`, `IPathVariable`, `CommandVariable`). Imported necessary types.

*   **[COMPLETED] Sub-Item 3b: Add `lodash` Dependency:**
    *   **Action:** Added `lodash` and `@types/lodash` as project dependencies.

*   **[COMPLETED] Sub-Item 3c: Refactor `StateFactory.createClonedState` for Deep Cloning:**
    *   **Action:** Modified `createClonedState` in `services/state/StateService/StateFactory.ts`.
    *   **Details:** Implemented deep cloning using `lodash.cloneDeep`. Ensured unique `stateId` and removed parent reference.
    *   **Note:** There might be a persistent issue importing `lodash.cloneDeep` correctly (or its types). The import statement was attempted multiple ways without resolving linter errors fully. The current state is `import { cloneDeep } from 'lodash';`.

*   **[COMPLETED] Sub-Item 3d: Investigate & Resolve Type Casting Issues:**
    *   **Action:** Analyzed and addressed type casting issues (`parentState as StateService`).
    *   **Details:** Refactored methods like `initializeState`, `createChildState`, `mergeChildState` to avoid direct casting where possible, relying on interface methods.

*   **[COMPLETED] Sub-Item 3e: Update `StateService` Read Methods:**
    *   **Action:** Refactored getter methods (`getTextVar`, `getDataVar`, `getPathVar`, `getCommandVar`, `getAll*Vars`, `getLocal*Vars`) in `StateService.ts`.
    *   **Details:** Updated methods to read from the new `StateNode` structure and return the correct rich variable types, aligning with `IStateService`.

*   **[COMPLETED] Sub-Item 3f: Update `StateService` Write Methods (`set*Var`):**
    *   **Action:** Refactored setter methods (`setTextVar`, `setDataVar`, `setPathVar`, `setCommandVar`) in `StateService.ts`.
    *   **Details:** Updated methods to accept correct inputs, construct rich variable objects using factory functions (added in `core/types/variables.ts`), populate metadata, store the objects, and return them, aligning with `IStateService`.

*   **[COMPLETED] Sub-Item 3g: Implement/Update Generic Variable Methods:**
    *   **Action:** Implemented generic methods (`getVariable`, `setVariable`, `hasVariable`, `removeVariable`) in `StateService.ts`.
    *   **Details:** Implemented methods to handle different `VariableType` values and delegate appropriately. Added placeholder `getParentState`.
    *   **Note:** Persistent difficulty was encountered applying edits to `setVariable` to correctly pass `variable.value` instead of the full `variable` object to the specific setters (e.g., `setTextVar`). While the current code *appears* correct in the attached file (`services/state/StateService/StateService.ts`), the linter errors suggest the change might not have fully registered or there's a deeper type issue. Please verify this method's implementation.

---

**HANDOVER NOTE (State Before Sub-Item 3h):**

*   **Goal:** Refactor `StateService` to use strict types from `core/types`.
*   **Progress:** Sub-items 3a-3g are complete.
*   **Next Step:** Implement **Sub-Item 3h: Refactor `StateService.clone()`**.
*   **Known Issues in `services/state/StateService/StateService.ts`:**
    *   **`lodash.cloneDeep` Import:** Linter error persists (`Cannot find module 'lodash.cloneDeep'`). This seems linked to `StateFactory.ts`, where edits to the import style were not applying reliably. The issue might be with type definitions (`@types/lodash`) or the build process.
    *   **Import Confusion:** General inconsistency in imports. Linter sometimes flags imports from `@core/types` suggesting they should be from `@core/types/index.js`. `VariableType` was particularly problematic (importing as value vs. type), check current imports carefully.
    *   **`transformNode` Mismatch:** The signature of `transformNode` in `StateService.ts` doesn't match the one defined in `IStateService.ts`.
    *   **Missing `getCommand`/`setCommand`:** Linter flags `StateService` as missing `getCommand`/`setCommand` from `IStateService`. This is *expected* as they were intentionally removed during the refactor (replaced by `getCommandVar`/`setCommandVar`). The `IStateService` interface itself might need updating later, or this mismatch is acceptable for now.
    *   **`setVariable` Implementation:** As noted in 3g, verify that `setVariable` correctly passes `variable.value` to the specific `set*Var` methods. Edits to fix this were previously unsuccessful.
    *   **`createChildState` Arguments:** Linter errors related to passing `value` instead of the expected type (e.g., `string` vs `TextVariable`) in `createChildState`'s calls to `set*Var`. This is similar to the `setVariable` issue and likely needs the same fix (passing `value.value`).
*   **Key Files:** `StateService.ts`, `IStateService.ts`, `StateFactory.ts`, `core/types/*`, `_plans/PLAN-PHASE-1.md`.

---

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