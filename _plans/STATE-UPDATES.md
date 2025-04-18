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

**Phase 1: Define/Update Core Types [DONE - Prerequisite]**

*   **Objective:** Ensure necessary type definitions exist and are centralized.
*   **Files:** `core/types/state.ts`, `core/types/index.ts`
*   **Status:** Completed as part of `_plans/PLAN-TYPES.md`.

**Phase 2: Update `StateNode` & `IStateService` Interfaces [DONE]**

*   **Objective:** Enhance the state data structure and its public interface.
*   **Files:** `services/state/StateService/types.ts` (for `StateNode`), `services/state/StateService/IStateService.ts`
*   **Status:** Completed. Interfaces updated.

**Phase 3: Update `StateFactory` Implementation [DONE]**

*   **Objective:** Align factory methods with the new `StateNode` structure.
*   **Files:** `services/state/StateService/StateFactory.ts`
*   **Status:** Completed. Factory logic updated and tests adjusted.

**Phase 4: Update `StateService` Implementation [DONE]**

*   **Objective:** Align the service implementation with the interface changes and new `StateNode` structure.
*   **Files:** `services/state/StateService/StateService.ts`
*   **Status:** Completed. Service refactored.

**Phase 5: Update Tests [COMPLETE]**

*   **Objective:** Ensure unit tests reflect the new state structure and interface.
*   **Files:** 
    *   `services/state/StateService/StateService.test.ts` (Updated)
    *   `services/state/utilities/StateVariableCopier.test.ts` (Updated)
    *   `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.edge.test.ts` (Updated)
    *   `services/resolution/ResolutionService/ResolutionService.test.ts` (Updated)
    *   `services/resolution/ResolutionService/resolvers/ContentResolver.test.ts` (Updated)
    *   `services/resolution/ResolutionService/resolvers/CommandResolver.test.ts` (Updated)
    *   `services/resolution/ResolutionService/resolvers/StringConcatenationHandler.test.ts` (Updated)
    *   `services/resolution/ResolutionService/resolvers/VariableReferenceResolver.test.ts` (Updated)
    *   `services/cli/CLIService/CLIService.test.ts` (Updated)
    *   `services/pipeline/InterpreterService/InterpreterService.integration.test.ts` (Updated)
    *   *Potentially others implicitly affected by state changes.*
*   **Status:** Completed.

**Phase 6: Refactor Codebase**

*   **Objective:** Update all service/handler code that uses the state service.
*   **Files:** 
    *   `services/state/StateService/factories/StateServiceClientFactory.ts`
    *   `services/state/StateService/migration.ts`
    *   `services/state/StateService/migration.test.ts`
    *   `services/state/StateService/AlwaysTransformedStateService.ts`
    *   `services/state/utilities/StateVariableCopier.ts`
    *   `services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.test.ts`
    *   `services/pipeline/InterpreterService/InterpreterService.ts`
    *   `services/resolution/ResolutionService/ResolutionService.ts` (Needs check - indirect usage via context)
    *   `services/pipeline/DirectiveService/DirectiveService.ts` (Needs check - likely usage)
    *   `services/pipeline/DirectiveService/handlers/*` (All handlers need checking)
    *   `services/pipeline/OutputService/OutputService.ts` (Needs check - indirect usage)
    *   `services/cli/CLIService/CLIService.ts` (Updated in Phase 5)
*   **Status:** Pending.

---
