# Meld Refactoring: Phase 1 Detailed Plan - Foundational Types & StateService

## Context:
- Overall Architecture: docs/dev/DI-ARCHITECTURE.md
- Pipeline Flow: docs/dev/PIPELINE.md
- Current AST Structure: docs/dev/AST.md 
- High-Level Refactoring Plan: _plans/PLAN-TYPES.md

## A. Type Refinement Proposals

Based on the review of the **revised** `@_spec/types/variables-spec.md` and the existing `StateService` implementation (`services/state/StateService/StateService.ts`, `IStateService.ts`), the proposed types incorporating refined Path/URL and Command variables appear robust and well-aligned with the objectives and the AST (`docs/dev/AST.md`).

**The revised specification in `@_spec/types/variables-spec.md` will be used as the basis for implementation.** We will consolidate these types into `core/types/variables.ts`.

## B. Detailed Implementation Plan

This plan expands on the Phase 1 punch list from `_plans/PLAN-TYPES.md`, using the **latest revised types**.

**Objective:** Introduce strict types for Meld variables (including refined Path/URL and Command variables) and refactor StateService to manage them. **Centralize all core type definitions.**

---

**Punch List Item 1:** Define **and centralize** core variable **and directive** types based on the **revised** `_spec/types/*.md` in `core/types/*`.

*   **Action:** Create/Update files in `core/types/` to hold all core type definitions from the specs.
*   **Files:** 
    *   `core/types/variables.ts` (New or Update)
    *   `core/types/paths.ts` (New or Update - See Phase 2 for path specifics)
    *   `core/types/define.ts` (New or Update)
    *   `core/types/embed.ts` (New or Update)
    *   `core/types/run.ts` (New or Update)
    *   `core/types/import.ts` (New or Update)
    *   `core/types/common.ts` (New or Update - for shared types like `SourceLocation`, `Result`, etc.)
    *   `core/types/index.ts` (Update for exports)
*   **Details/Considerations:**
    *   Copy the relevant type definitions directly from the **latest version** of `_spec/*.md` into these files. This includes variable types, path types, directive-specific types (`ICommandDefinition`, `EmbedParams`, `RunDirective`), context objects, and common types.
    *   Ensure necessary imports between these new type files.
    *   Add/Update JSDoc comments.
*   **Testing:** Compilation checks.

---

**Punch List Item 2:** Refactor `IStateService` interface methods to use/return these strict, **revised** types.

*   **Action:** Modify method signatures in `IStateService`.
*   **Files:** `services/state/StateService/IStateService.ts`
*   **Details/Considerations:**
    *   Update `getTextVar` return type to `TextVariable | undefined`.
    *   Update `setTextVar` signature: `setTextVar(name: string, value: string, metadata?: Partial<VariableMetadata>): TextVariable;`.
    *   Update `getDataVar` return type to `DataVariable | undefined`.
    *   Update `setDataVar` signature: `setDataVar(name: string, value: JsonValue, metadata?: Partial<VariableMetadata>): DataVariable;`.
    *   Update `getPathVar` return type to **`IPathVariable | undefined`**.
    *   Update `setPathVar` signature: **`setPathVar(name: string, value: IFilesystemPathState | IUrlPathState, metadata?: Partial<VariableMetadata>): IPathVariable;`** (Accepts the union state).
    *   Update `getCommandVar` return type to **`CommandVariable | undefined`**.
    *   Update `setCommandVar` signature: **`setCommandVar(name: string, value: ICommandDefinition, metadata?: Partial<VariableMetadata>): CommandVariable;`** (Accepts the structured definition).
    *   Update generic `getVariable` return type to `MeldVariable | undefined`.
    *   Update generic `setVariable` signature: `setVariable(variable: MeldVariable): MeldVariable;`.
    *   Update `hasVariable` signature: `hasVariable(name: string, type?: VariableType): boolean;`.
    *   Update `removeVariable` signature: `removeVariable(name: string, type?: VariableType): boolean;`.
    *   Update `getAllTextVars` return type to `Map<string, TextVariable>`.
    *   Update `getAllDataVars` return type to `Map<string, DataVariable>`.
    *   Update `getAllPathVars` return type to **`Map<string, IPathVariable>`**.
    *   Update `getAllCommands` return type to **`Map<string, CommandVariable>`**.
    *   Update `getLocal*Vars` similarly if kept.
    *   Add imports for the **revised** types from `core/types/`.
*   **Testing:** No direct tests, but dependent tests will fail.

---

**Punch List Item 3:** Refactor `StateService` implementation.

*   **Action:** Update internal storage, method implementations, and `clone()` logic using **revised types**.
*   **Files:** `services/state/StateService/StateService.ts`, `services/state/StateService/types.ts` (update `StateNode` definition)
*   **Details/Considerations:**
    *   **Internal Storage (`StateNode` in `types.ts`):**
        *   Modify `variables` property in `StateNode` interface.
        *   Change `text: Map<string, string>` to `text: Map<string, TextVariable>`.
        *   Change `data: Map<string, unknown>` to `data: Map<string, DataVariable>`.
        *   Change `path: Map<string, string>` to **`path: Map<string, IPathVariable>`**.
        *   Change `commands: Map<string, ...>` to **`commands: Map<string, CommandVariable>`**.
    *   **Method Implementations (`StateService.ts`):**
        *   Update `get*Var` methods to return the full typed objects.
        *   Update `set*Var` methods:
            *   Construct the appropriate typed variable object (`TextVariable`, `DataVariable`, `IPathVariable`, `CommandVariable`).
            *   For `setPathVar`, create the `IPathVariable` containing the passed `IFilesystemPathState` or `IUrlPathState` in its `value` field.
            *   For `setCommandVar`, create the `CommandVariable` containing the passed `ICommandDefinition` in its `value` field.
            *   Populate standard metadata.
            *   Store the complete object in the corresponding map.
            *   Return the created variable object.
        *   Implement/Update `getVariable`, `setVariable`, `hasVariable`, `removeVariable`.
        *   Update `getAll*Vars` and `getLocal*Vars`.
    *   **Non-destructive transformations (`clone()`):**
        *   **Implement deep cloning using `lodash.cloneDeep` within the `StateFactory.createClonedState` method.** This ensures correct handling of nested state within `IPathVariable.value` and potentially complex `ICommandDefinition` structures within `CommandVariable.value`. **The existing `StateVariableCopier` utility (`services/state/utilities/StateVariableCopier.ts`) is intended for copying variables *between* different state instances and is not suitable for the deep cloning required within the `clone()` operation.** Prevent unintended mutations across states during transformations.
    *   **`SourceLocation` Tracking:** Maintain strategy of allowing `metadata` (including `definedAt`) to be passed in; handlers will provide it.
    *   **RHS Handling:** Confirm `StateService` stores the *resolved* value state (e.g., `IPathVariable` with populated URL state) as provided by directive handlers.
    *   **Dependencies:** Update imports to use types from `core/types/`. Handle type errors from dependents.
*   **Testing:** Requires significant updates to `services/state/StateService.test.ts`.

---

**Punch List Item 4:** Update existing `StateService` unit tests.

*   **Action:** Modify test cases to reflect the new **revised** typed interface and behavior.
*   **Files:** `services/state/StateService.test.ts`, potentially `StateFactory.test.ts`
*   **Details/Considerations:**
    *   Update assertions to expect the full, **revised** variable objects (`TextVariable`, `DataVariable`, `IPathVariable`, `CommandVariable`).
    *   Verify properties within `IPathVariable.value` (checking `contentType` and relevant fields for both FS and URL states).
    *   Verify properties within `CommandVariable.value` (checking `type` and relevant fields of the stored `ICommandDefinition`).
    *   Update tests for `set*Var` methods.
    *   Add tests for generic methods.
    *   **Crucially, update `clone()` tests:** Verify deep copying **performed by `lodash.cloneDeep` within `StateFactory.createClonedState`** for the **new structures** within `IPathVariable` and `CommandVariable`.
    *   Update state inheritance tests.
*   **Testing:** Run all state tests.

---

**Punch List Item 5:** Begin updating direct dependents of `StateService`.

*   Action: Identify services using `StateService` and update calls (initially focusing on signature changes).
*   Files: `ResolutionService`, handlers, `OutputService`, etc.
*   Details/Considerations:
    *   Dependents calling `getPathVar` or `getCommandVar` will now receive the **richer `IPathVariable` or `CommandVariable` objects**. They will need to access `.value` and potentially check `contentType` (for paths) or `.type` (for commands) to get specific details.
    *   Calls like `stateService.getPathVar('name')?.value` might now return a union (`IFilesystemPathState | IUrlPathState`), requiring type guards (`isFilesystemPath`, `isUrlPath`) before accessing specific properties.
    *   Calls to `setPathVar` / `setCommandVar` need to be updated to pass the correct structured state/definition object.
    *   Continue using temporary casts sparingly with TODOs.
*   Testing: Address immediate test failures in dependents due to signature changes.

--- 