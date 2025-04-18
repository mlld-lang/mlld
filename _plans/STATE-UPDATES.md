# Plan: State System Enhancements

## Context:
- Overall Architecture: docs/dev/DI-ARCHITECTURE.md
- Pipeline Flow: docs/dev/PIPELINE.md
- Current AST Structure: docs/dev/AST.md
- High-Level Refactoring Plan: _plans/PLAN-TYPES.md
- Current Top-Level Plan: _plans/_PLAN.md

## Goal:
Refactor the core state management system (`StateNode`, `IStateService`, `StateFactory`, `StateService`) to be more robust, explicit, and easier to debug by incorporating necessary contextual information directly into the state data structure. This addresses issues identified during recent debugging, particularly around cloning, parent scope lookups, and transformation context.

## Phases:

**Phase 1: Define/Update Core Types**

*   **Objective:** Ensure necessary type definitions exist and are centralized.
*   **Files:** `core/types/state.ts`, `core/types/index.ts`
*   **Steps:**
    1.  Define `TransformationOptions` interface in `core/types/state.ts` (include `enabled: boolean`, `transformNested: boolean`, potentially others like `directivesToTransform?: string[]`).
    2.  Ensure `IStateService` is imported/exported correctly via `core/types/index.ts`.
    3.  Add `NodeId = string;` type alias (or similar) if not already present, maybe in `core/types/common.ts`.

**Phase 2: Update `StateNode` & `IStateService` Interfaces**

*   **Objective:** Enhance the state data structure and its public interface.
*   **Files:** `services/state/StateService/types.ts` (for `StateNode`), `services/state/StateService/IStateService.ts`
*   **Steps:**
    1.  **Modify `StateNode` Interface:**
        *   Add `readonly parentServiceRef?: IStateService;`
        *   Add `readonly transformationOptions: TransformationOptions;`
        *   Add `readonly createdAt: number;`
        *   Add `readonly modifiedAt: number;`
        *   **Remove** `readonly parentState?: StateNode;` (replaced by `parentServiceRef`).
        *   *(Optional)* Add `readonly nodeId?: NodeId;` (If we decide NodeId belongs here instead of just on MeldNode, though less likely).
    2.  **Modify `IStateService` Interface:**
        *   **Remove:** `getTextVar`, `getDataVar`, `getPathVar`, `getCommandVar`.
        *   **Remove:** `getLocalTextVars`, `getLocalDataVars`, `getLocalPathVars`, `getLocalCommands`.
        *   **Remove:** `getCommand` (redundant with `getCommandVar` before, now redundant with `getVariable`).
        *   **Update:** Ensure `getVariable` signature is `getVariable(name: string, type?: VariableType): MeldVariable | undefined;`.
        *   **Update:** Ensure `setVariable` signature is `setVariable(variable: MeldVariable): Promise<MeldVariable>;`.
        *   **Update:** Ensure `hasVariable` signature is `hasVariable(name: string, type?: VariableType): boolean;`.
        *   **Update:** Ensure `removeVariable` signature is `removeVariable(name: string, type?: VariableType): Promise<boolean>;`.
        *   **Update:** Ensure `getParentState` signature is `getParentState(): IStateService | undefined;`.
        *   **Update/Keep:** `getTransformationOptions(): TransformationOptions;`
        *   **Update/Keep:** `setTransformationOptions(options: TransformationOptions): void;`
        *   **Update/Keep:** `isTransformationEnabled(): boolean;` (Implementation will read from options).
        *   **Update/Keep:** `setTransformationEnabled(enabled: boolean): void;` (Implementation will update options).
        *   **Update/Keep:** `shouldTransform(type: string): boolean;` (Implementation will read from options).
        *   *(Decision)* Remove optional `metadata` parameter from `setPathVar` and `setCommandVar` if handlers no longer pass it (verify first).

**Phase 3: Update `StateFactory` Implementation**

*   **Objective:** Align factory methods with the new `StateNode` structure.
*   **Files:** `services/state/StateService/StateFactory.ts`
*   **Steps:**
    1.  **Update `createState`:**
        *   Accept `parentServiceRef?: IStateService` and `transformationOptions?: TransformationOptions` in options.
        *   Initialize `createdAt`, `modifiedAt`.
        *   Store `parentServiceRef`.
        *   Initialize `transformationOptions` (use passed value or default/inherited).
    2.  **Update `createChildState`:**
        *   Accept parent `IStateService` instance.
        *   Pass parent instance as `parentServiceRef` to `createState`.
        *   Implement logic for inheriting/setting `transformationOptions` for the child.
    3.  **Update `createClonedState`:**
        *   Ensure constructor correctly copies `parentServiceRef` and `transformationOptions` from the `originalState`'s data.
        *   Set new `createdAt`, `modifiedAt`.
        *   **Remove** explicit setting of `parentState = undefined`.
    4.  **Update `updateState`:**
        *   Ensure `parentServiceRef` and `transformationOptions` are copied from `state` unless explicitly in `updates`.
        *   Set `modifiedAt`.
    5.  **Update `mergeStates`:**
        *   Determine correct `parentServiceRef` (likely from `parent`) and `transformationOptions` (likely from `parent`) for the merged state.
        *   Set `modifiedAt`.

**Phase 4: Update `StateService` Implementation**

*   **Objective:** Align the service implementation with the interface changes and new `StateNode` structure.
*   **Files:** `services/state/StateService/StateService.ts`
*   **Steps:**
    1.  **Remove Internal Properties:** Delete `_parentState`, `_transformationEnabled`, `_transformationOptions`.
    2.  **Update `getParentState`:** Return `this.currentState.parentServiceRef`.
    3.  **Update Transformation Methods:** Implement `isTransformationEnabled`, `setTransformationEnabled`, `getTransformationOptions`, `setTransformationOptions`, `shouldTransform` to read/write `this.currentState.transformationOptions` (using `updateState` for setters).
    4.  **Update `clone`:** Remove manual setting of `_parentState`. Rely on `StateFactory.createClonedState`.
    5.  **Update `createChildState`:** Remove manual setting of transformation options. Rely on `StateFactory.createChildState`. Ensure parent *service* instance (`this`) is passed correctly.
    6.  **Update `getVariable`:** Ensure parent lookup uses `this.getParentState()`.
    7.  **Remove Specific Getters:** Delete implementations of `getTextVar`, `getDataVar`, etc.
    8.  **(If necessary) Remove `metadata` Param:** Remove from `setPathVar`/`setCommandVar` if decided in Phase 2.
    9.  **Verify `setVariable`:** Double-check it correctly calls specific setters with `variable.value`.
    10. **Verify Imports:** Ensure all types are imported correctly.

**Phase 5: Update Tests**

*   **Objective:** Ensure unit tests reflect the new state structure and interface.
*   **Files:** `services/state/StateService/StateService.test.ts`, `services/state/StateService/StateFactory.test.ts`, *all other test files that mock or use `IStateService`*.
*   **Steps:**
    1.  **Update `StateService/Factory` Tests:**
        *   Adapt mocks and assertions for new `StateNode` properties (`parentServiceRef`, `transformationOptions`, timestamps).
        *   Update tests for removed getters (delete tests or change to test `getVariable`).
        *   Verify `clone` preserves `parentServiceRef` and copies `transformationOptions`.
        *   Verify `getVariable` recursion works.
    2.  **Update Dependent Tests:**
        *   Search codebase for usages of `getTextVar`, `getDataVar`, etc. (especially in mocks and assertions) and replace with `getVariable`. Update mock implementations accordingly.
        *   Update mocks of `IStateService` (`createStateServiceMock`) to fully match the *final* `IStateService` interface (including new methods/properties, removing deleted ones).

**Phase 6: Refactor Codebase**

*   **Objective:** Update all service/handler code that uses the state service.
*   **Files:** Various files in `services/`
*   **Steps:**
    1.  Replace all calls to removed specific getters (`getTextVar`, etc.) with calls to `getVariable(name, Type)`.
    2.  If `metadata` param was removed from setters, remove it from calls.
    3.  Adjust any logic that relied on the old transformation flags to use `getTransformationOptions` or `shouldTransform`.

---
