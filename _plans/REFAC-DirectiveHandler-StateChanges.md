# Refactor: Directive Handler Interface (`execute` -> `handle` / `StateChanges`)

This document outlines a refactor changing the core interface and return mechanism for directive handlers (`IDirectiveHandler`).

## Goal

Transition directive handlers from directly modifying the `IStateService` instance provided in their context to returning a description of the intended state modifications.

- Rename the primary handler method from `execute` to `handle`.
- Modify the return type from `Promise<IStateService | DirectiveResult_Old>` to `Promise<DirectiveResult_New>`.
- Update the `DirectiveResult` interface to contain an optional `stateChanges` object (describing variable changes) instead of the full `state: IStateService` object.

## Rationale / Benefits

- **Decoupling:** Handlers become less stateful, focusing on calculating changes rather than performing direct side effects on the state service.
- **Testability:** Simplifies unit testing of handlers, potentially reducing the need for complex state service mocking.
- **Serialization / IPC:** The `StateChanges` object is a plain data structure, making it suitable for serialization and Inter-Process Communication (IPC), aligning better with the service-client architecture (e.g., `InterpreterServiceClient`).
- **Clearer Contract:** The `handle(): Promise<DirectiveResult { stateChanges?, replacement? }>` signature arguably provides a clearer representation of a directive's function: producing state changes and/or replacement nodes.

## Relation to `BUG-RESOLUTION.md`

This refactor was **independent** of the bug described in `BUG-RESOLUTION.md` (failure in `ResolutionService.resolveNodes` causing "Path cannot be empty" errors). It modified the *interface* for handlers, not the internal logic of the `ResolutionService`.

## Work Done So Far (As of 2025-04-18)

1.  **Interfaces Updated:**
    *   `IDirectiveHandler` (in `IDirectiveService.ts`) method renamed to `handle`, return type updated to `Promise<DirectiveResult>`.
    *   `DirectiveResult` (in `core/directives/DirectiveHandler.ts`) updated to use `stateChanges?: StateChanges` and `replacement?: MeldNode[]`.
2.  **Handlers Refactored:** All known directive handlers (`Import`, `Text`, `Data`, `Path`, `Define`, `Run`, `Embed`) updated to:
    *   Implement `handle` instead of `execute`.
    *   Return the new `DirectiveResult` shape.
    *   Calculate intended variable modifications and place them in `stateChanges.variables` instead of calling `state.setVariable` directly.
3.  **DirectiveService Updated:**
    *   Calls `specificHandler.handle()` instead of `specificHandler.execute()`.
    *   Processes the returned `DirectiveResult`:
        *   Extracts `stateChanges.variables`.
        *   Iterates through changes, reconstructs `MeldVariable` objects using factories.
        *   Calls `state.setVariable()` on the context's state service instance to apply changes.
4.  **InterpreterService Updated:**
    *   The `interpretNode` method's `'Directive'` case was updated to correctly handle the new `DirectiveResult` returned from `directiveClient.handleDirective`.
    *   It now correctly extracts `replacement` nodes and defers state modification application to `DirectiveService`.
5.  **Tests Updated (Partially):**
    *   Calls in handler unit tests (`*.test.ts`) and the `DirectiveTestFixture` helper changed from `.execute` to `.handle`.
    *   `DataDirectiveHandler.test.ts` assertions updated to check `result.stateChanges` and remove checks for direct `stateService.setVariable` calls (as of 2025-04-18).

## Current Status & Issues (As of 2025-04-18)

- **Significant Test Failures:** Despite the core refactor being implemented across handlers and services, many tests are failing:
    - `npm test services`: ~86 failures.
    - `npm test api`: ~16 failures.
- **Primary Refactor-Induced Bug:**
    - `TypeError: Right-hand side of 'instanceof' is not an object` occurring in import-related tests (`ImportDirectiveHandler.test.ts`, `api/integration.test.ts`). This seems related to how `ImportDirectiveHandler` processes the result from its recursive `interpreterServiceClient.interpretNode` call, which now returns the new `DirectiveResult` structure.
- **Regression in Refactored Handler:**
    - `DataDirectiveHandler.test.ts` shows a `DirectiveError: ... Failed to parse value for @data directive 'message' as JSON...`, indicating the refactored handler incorrectly attempts to parse non-JSON string literals (Fixed as of YYYY-MM-DD, but noted here for context).
- **Assertion Failures / Incomplete Test Updates:** Many handler tests (`Define`, `Text`, `Import`, integration tests) fail due to outdated assertions:
    - Expecting the handler to return `IStateService`.
    - Expecting `stateService.setVariable` (or specific variants) to have been called directly by the handler.
- **Potential Test Setup Issues:** Failures in `DirectiveService.test.ts` (`specificHandler.handle is not a function`) and `InterpreterService.unit.test.ts` (`transformNode` not called) may indicate issues with test mocks/setup not aligning with the refactored interfaces/return types.
- **Pre-existing Bugs Persist:**
    - The `resolveNodes` bug (`BUG-RESOLUTION.md`) causing "Path cannot be empty" errors remains unresolved.
    - `TypeError: main is not a function` errors in `api/resolution-debug.test.ts` persist.

## Remaining Work

1.  **Fix `instanceof` Error:** Investigate and fix the `TypeError: Right-hand side of 'instanceof' is not an object` in `ImportDirectiveHandler.handle` related to processing `interpretationResult`.
2.  **Fix `DataDirectiveHandler` Regression:** Address the JSON parsing error identified in `DataDirectiveHandler.test.ts` where the handler incorrectly attempts to parse non-JSON string literals. (This might be resolved now, double-check test results).
3.  **Update Test Assertions:** Systematically update assertions in **all other** affected handler test files (`Text`, `Path`, `Define`, `Run`, `Embed`, `Import` test files within `services/pipeline/DirectiveService/handlers/`) to:
    *   Remove checks expecting `IStateService` as the return value.
    *   Remove checks for direct `stateService.setVariable` calls.
    *   Add checks for the content of `result.stateChanges.variables` where applicable.
    *   Ensure assertions checking `result.replacement` are still correct.
    *   Verify the handler's logic post-refactor (as highlighted by the `DataDirectiveHandler` regression initially).
4.  **Address Pre-existing Bugs:**
    *   Investigate and fix the `resolveNodes` bug (`BUG-RESOLUTION.md`).
    *   Investigate and fix the `main is not a function` errors in `api/resolution-debug.test.ts`.
5.  **Address Downstream Failures:** Resolve any remaining assertion failures or errors in `api` tests after the above steps are completed.
6.  **Code Cleanup:** Remove the unused, old `DirectiveResult` definition from `services/pipeline/DirectiveService/interfaces/DirectiveTypes.ts` once all components reliably use the new one.

## Decision Point

If Step 1 (fixing the `instanceof`