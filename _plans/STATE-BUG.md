# State Service Bug Investigation Notebook (`InterpreterService` Integration Tests)

## 1. Issue Description

During integration testing of `InterpreterService` (`services/pipeline/InterpreterService/InterpreterService.integration.test.ts`) after the AST Variable refactoring, several tests consistently fail, pointing to underlying issues in state management or propagation. Two main failure symptoms are observed:

1.  **Empty Text Variables:** Tests setting simple text variables (e.g., `@text test = "value"`) fail because subsequent reads retrieve an empty string (`""`) instead of the expected value (`"value"`). This occurs even when logs show the correct value being processed and assigned internally.
2.  **Path Validation Errors:** Tests involving `@path` directives fail with a `TypeError: context.state?.getCurrentFilePath is not a function` originating from `ResolutionService.createValidationContext`. This indicates the `state` object available during path validation is incomplete or not a functional `StateService` instance.

These issues prevent several core integration tests from passing, suggesting problems with state integrity, cloning, updates, or propagation between services within the `TestContextDI` environment.

## 2. Files Involved

*   **Tests:** `services/pipeline/InterpreterService/InterpreterService.integration.test.ts`
*   **Core Service:** `services/state/StateService/StateService.ts`
*   **State Management:** `services/state/StateService/StateFactory.ts`
*   **Interfaces:**
    *   `services/state/StateService/IStateService.ts`
    *   `core/shared-service-types.ts` (specifically `StateServiceLike`)
    *   `services/pipeline/DirectiveService/interfaces/DirectiveTypes.ts` (`DirectiveContext`)
    *   `core/types/resolution.ts` (`ResolutionContext`)
*   **Pipeline/Handlers:**
    *   `services/pipeline/InterpreterService/InterpreterService.ts`
    *   `services/pipeline/DirectiveService/DirectiveService.ts`
    *   `services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.ts`
    *   `services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.ts`
*   **Resolution:** `services/resolution/ResolutionService/ResolutionService.ts`
*   **Test Utilities:** `tests/utils/di/TestContextDI.ts`
*   **Types:** `core/types/variables.ts`

## 3. Expected Data Flow (Simplified for Text Variable Setting)

1.  Test calls `interpreter.interpret` with nodes including `@text test = "value"`.
2.  `InterpreterService` clones the initial state (`S0`) -> `S1`.
3.  `InterpreterService` calls `DirectiveService.handleDirective` with context containing `state: S1`.
4.  `DirectiveService` finds `TextDirectiveHandler` and calls `handler.execute` with context containing `state: S1`.
5.  `TextDirectiveHandler` clones state `S1` -> `S2`.
6.  `TextDirectiveHandler` resolves the value `"value"`.
7.  `TextDirectiveHandler` calls `newState.setTextVar('test', 'value')` (where `newState` is `S2`).
8.  `StateService (S2).setTextVar` creates `TextVariable{value: "value"}`.
9.  `StateService (S2).setTextVar` calls its internal `_updateState`.
10. `StateService (S2)._updateState` calls `StateFactory.updateState(S2_Node, { text: map_with_value })`.
11. `StateFactory.updateState` returns a *new* `StateNode` (`S3_Node`) containing the updated text map `{ 'test': TextVariable{value: "value"} }`.
12. `StateService (S2)._updateState` assigns `this.currentState = S3_Node`. **At this point, instance S2's internal state points to S3_Node.**
13. `TextDirectiveHandler` returns `newState` (instance `S2`, now internally holding state `S3_Node`).
14. `InterpreterService` receives `S2` back as the result state.
15. `InterpreterService.interpret` returns the final state (`S2`).
16. Test assertion calls `resultState.getTextVar('test')` (where `resultState` is instance `S2`).
17. `StateService (S2).getTextVar` reads `this.currentState` (which should be `S3_Node`), gets the `TextVariable` from the map, and returns it.

## 4. Logs & Evidence Collected

*   **Initial Failures (11 tests):** Included incorrect assertions (`expected object to be string`, `expected '' to be 'value'`), path validation errors (`getCurrentFilePath is not function`), and tests expecting errors that no longer threw.
*   **Fix 1 (Assertions):** Correcting `getTextVar` assertions from `toBe('value')` to `toBe(varObj.value)` fixed some tests but revealed the core `expected '' to be 'value'` failure.
*   **Fix 2 (Path Node Creation):** Manually creating `@path` nodes fixed syntax but not the underlying `getCurrentFilePath is not function` error.
*   **Fix 3 (Error Test Logic):** Rewriting error tests to expect success (due to non-throwing interpolation errors) fixed 5 tests.
*   **`StateService.clone` Investigation:**
    *   Logs confirmed `StateService.clone` *does* return a `StateService` instance with the `getCurrentFilePath` method and correct `filePath` data.
    *   **Conclusion:** The `clone` method itself seems correct; the instance integrity is lost *after* cloning during propagation.
*   **`TextDirectiveHandler` Investigation:**
    *   Logs confirmed it calls `resolutionService.resolveNodes` and receives the correct string value (e.g., `"value"`).
    *   Logs confirmed it calls `newState.setTextVar` with the correct identifier and the resolved value.
    *   **Conclusion:** The handler correctly processes and attempts to set the variable.
*   **`ResolutionService.resolveNodes` Investigation:**
    *   Logs confirmed it correctly handles `TextNode` input (pushes content to `resolvedParts`) and returns the expected string.
    *   **Conclusion:** Resolution of simple text values is working.
*   **`StateFactory.updateState` Investigation:**
    *   Initial suspicion of shallow copying `variables` sub-maps was addressed by fix attempt (merging maps instead of replacing `variables` object). **Did not fix text error.**
    *   Later fix (creating *new* maps for `text`, `data`, `path` always) was applied. **Did not fix text error.**
    *   Log added before `return updated` showed `updated.variables.text` *did* contain the correct `TextVariable` object with `value: 'value'`.
    *   **Conclusion:** The factory *returns* a `StateNode` object that appears correct internally at the moment of return.
*   **`StateFactory.mergeStates` Investigation:**
    *   Identified shallow copying of variable objects during merge.
    *   Fix applied: Used `cloneDeep` on variable objects during merge. **Did not fix text error.**
    *   **Conclusion:** While shallow copying was an issue, it wasn't the root cause of the failing tests.
*   **`StateService.setTextVar / _updateState` Investigation:**
    *   Log added *after* `this.currentState = newStateNode` assignment in `_updateState` confirmed that `this.currentState` contained the correct `TextVariable` object with `value: 'value'` *immediately after* the update.
    *   **Conclusion:** The state update assignment within the service instance seems successful *at that moment*.
*   **`StateService.getTextVar` Investigation:**
    *   Log added confirmed that when the test assertion calls `getTextVar` on the correct State ID, the method finds the variable key but the retrieved object's `value` property is `''`.
    *   **Conclusion:** The `TextVariable` object stored within the `currentState.variables.text` map is being mutated (value changed from `"value"` to `""`) sometime *after* `_updateState` completes but *before* the test assertion runs `getTextVar`.
*   **Event Emission (`emitEvent`) Investigation:**
    *   Commenting out the `emitEvent` call in `_updateState` did *not* fix the text errors.
    *   **Conclusion:** The mutation is not caused by an asynchronous event handler triggered by the state update.
*   **`cloneDeep` Investigation:**
    *   Explicitly deep-cloning variable maps *again* inside `StateFactory.createClonedState` did *not* fix the errors.
    *   Explicitly deep-cloning the `TextVariable` object inside `StateService.setTextVar` right before `Map.set` did *not* fix the errors.
    *   **Conclusion:** The issue is unlikely to be a simple failure of `lodash.cloneDeep` to copy the relevant data structure correctly.

## 5. What We've Learned (Evidence-Based)

1.  The `StateService.clone` method correctly creates a new `StateService` instance containing the methods and internal state data (like `filePath`) of the original.
2.  The `TextDirectiveHandler` correctly resolves simple string values and calls `StateService.setTextVar` with the correct arguments.
3.  `ResolutionService.resolveNodes` correctly handles simple `TextNode` inputs.
4.  `StateFactory.updateState` receives the correct updated variable map and returns a new `StateNode` containing that correct map.
5.  `StateService._updateState` correctly assigns the new `StateNode` returned by the factory to its internal `this.currentState` reference. The variable value is correct immediately after this assignment.
6.  When test assertions later call `getTextVar` on the *same State ID*, the `TextVariable` object is found, but its `value` property has become `""`.
7.  The path directive errors (`getCurrentFilePath is not function`) occur because the `state` object in the `ResolutionContext` is not a functional `StateService` instance when `ResolutionService` needs it.
8.  The root cause is **not** simple async timing related to `emitEvent`.
9.  The root cause is **not** a simple failure of `cloneDeep` in the factory or `setTextVar`.
10. The core problem involves **either unexpected mutation** of the stored `TextVariable` object's value *after* it's been set in the state **or degradation/replacement** of the `StateService` instance during context propagation, leading to methods being lost (path error) or tests accessing stale/incorrect instances (text error). Both point to issues in the interaction between `StateService`, the pipeline services, and the DI/test environment.

---

This covers the known facts and evidence. The next step requires investigating the context propagation (`InterpreterService` -> `DirectiveService` -> Handler) and potentially the DI container (`tsyringe`) / test harness (`TestContextDI`) behavior. 