# SCIENCE NOTEBOOK: DirectiveProcessingContext Type Mismatch Investigation

## 1. Problem Statement

Despite verifying correct type definitions and imports, the TypeScript type checker consistently fails to infer the correct types for the `context` parameter within directive handler `execute` methods (e.g., in `DefineDirectiveHandler`). Specifically:
*   `context.directiveNode` is inferred as `INode` or `MeldNode` instead of the expected `DirectiveNode`.
*   `context.state` is inferred as `StateServiceLike` instead of the expected `IStateService`.

This occurs even though:
*   `DirectiveProcessingContext` (defined in `core/types/index.ts`) correctly specifies `directiveNode: DirectiveNode` and `state: IStateService`.
*   `IDirectiveHandler` (defined in `IDirectiveService.ts`) correctly specifies the `execute` method signature as `execute(context: DirectiveProcessingContext)`.
*   The handler class (e.g., `DefineDirectiveHandler`) correctly implements `IDirectiveHandler` and uses `context: DirectiveProcessingContext` in its `execute` signature.

This prevents clean builds without workarounds (type assertions) and indicates a deeper issue in type resolution or DI interaction.

## 2. Confirmed Facts

*   **Definitions Correct:** `DirectiveProcessingContext`, `DirectiveNode`, `INode`, `IStateService`, `StateServiceLike`, `IDirectiveHandler`, `IDirectiveService` definitions reviewed and appear correct in isolation.
*   **Imports Correct:** Imports for these types in relevant files (`core/types/index.ts`, `DefineDirectiveHandler.ts`, `DirectiveService.ts`, `IDirectiveService.ts`, etc.) seem correct.
*   **`tsconfig.json` Okay:** No obvious conflicting settings found.
*   **Clean Build / TS Restart Ineffective:** Issue persists after cache clearing and server restarts.
*   **DI Config Refactored:** Core services (`State`, `Resolution`, `FS`, `Path`, etc.) now use standard `container.register` in `core/di-config.ts`, eliminating manual instantiation (as per `PLAN-DI-REFACTOR`). DI *build* passes (no resolution errors), but type errors remain elsewhere.

## 3. Current Hypotheses

*   **(H1) Type Inference Issue:** TypeScript struggles to correctly infer/propagate the specific types from `DirectiveProcessingContext` across the interface/implementation boundary when the handler instance is retrieved from the `DirectiveService.handlers` map.
*   **(H2) DI Container Influence:** Although DI registration uses full interfaces now, there might be subtle ways the container's resolution mechanism influences type checking downstream.
*   **(H3) Conflicting Type Definitions/Aliases:** An overlooked duplicate definition or type alias somewhere in the project.
*   **(H4) Interface/Base Type Interaction:** Subtle conflicts or ambiguities in how `DirectiveNode` extends `INode`/`MeldNode` or how `IStateService` relates to `StateServiceLike` might be confusing the checker in this specific context.

## 4. Investigation Log

*   **[Timestamp] Action:** Verified `DirectiveProcessingContext` definition in `core/types/index.ts`. **Finding:** Correctly uses `DirectiveNode` and `IStateService`.
*   **[Timestamp] Action:** Verified `INode` definition in `core/syntax/types/interfaces/INode.ts`. **Finding:** Basic interface without `.directive` property.
*   **[Timestamp] Action:** Verified `StateServiceLike` definition in `core/shared-service-types.ts`. **Finding:** Is a subset of `IStateService`, missing key methods.
*   **[Timestamp] Action:** Verified `IDirectiveHandler` definition in `IDirectiveService.ts`. **Finding:** Correctly uses `execute(context: DirectiveProcessingContext)`.
*   **[Timestamp] Action:** Verified `DefineDirectiveHandler` imports and class signature. **Finding:** Imports and `implements IDirectiveHandler` clause are correct.
*   **[Timestamp] Action:** Analyzed `DirectiveService.handleDirective`. **Finding:** Context creation and `handler.execute` call *appear* type-safe based on local definitions.
*   **[Timestamp] Action:** Refactored `di-config.ts` to remove manual DI for core services. **Finding:** Build passes DI resolution but type errors persist elsewhere.
*   **[Timestamp] Action:** Corrected definition of `DirectiveProcessingContext` in `core/types/index.ts` (was using `MeldNode` and `StateServiceLike`). **Finding:** Resolved issue in definition file, but handler errors persisted initially, likely due to stale cache.
*   **[Timestamp] Action:** Re-checked handler/service code flow after correcting context definition & TS restart. **Finding:** Code flow appears logically sound; type checker inference seems to be the primary suspect.

## 5. Potential Solutions (TBD)

*   *(Pending Investigation)*

## 6. Decision / Next Action

*   *(Pending Investigation)* 