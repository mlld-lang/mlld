# Plan: DI Refactor & Like Type Removal

## 1. Goal

Refactor the Dependency Injection (DI) setup to:
1.  Eliminate manual instantiation (`new Service(...)`) and registration (`registerInstance`) for core, interdependent services (`StateService`, `ResolutionService`, `FileSystemService`, `PathService`) in `core/di-config.ts`.
2.  Rely on `tsyringe`'s container management via `@Service` decorators and constructor `@inject`.
3.  Utilize the existing Client Factory pattern (`...ServiceClientFactory`) consistently to manage circular dependencies between these core services at runtime.
4.  Remove simplified `...Like` interfaces (e.g., `StateServiceLike`) from service interface definitions (`I...Service.ts`), replacing them with the full interfaces (`IStateService`, etc.).

This aims to improve type safety, resolve persistent type inference issues (like the `DirectiveProcessingContext` problem), simplify DI configuration, enhance maintainability, and provide a stable foundation for completing the `PLAN-TYPES` refactor and enabling E2E testing.

Reference: Findings documented in `_plans/FIXING-TYPE-ISSUES.md`.

## 2. Phases

### Phase 1: Analysis & `Like` Type Removal Prep

*   **Objective:** Identify all manual DI configurations and `Like` type usages, ensuring necessary Client Factories exist.
*   **Tasks:**
    *   Map all manual instantiations (`new ...`) and registrations (`registerInstance`) in `core/di-config.ts` for `StateService`, `ResolutionService`, `FileSystemService`, `PathService`.
    *   Identify *all* usages of `...Like` types (from `core/shared-service-types.ts`) across *all* `I...Service.ts` interfaces.
    *   Identify all corresponding Client Factories (`...ClientFactory`) used for these core services.
    *   Verify that the existing Client Factories expose the necessary methods to fully replace the functionality previously covered by the `Like` interfaces. Update/add methods to factories if needed.

### Phase 2: Refactor Core Services to use `@Service` & `@inject`

*   **Objective:** Modify core service implementations to use standard DI patterns.
*   **Target Files:** `StateService.ts`, `ResolutionService.ts`, `FileSystemService.ts`, `PathService.ts`.
*   **Tasks (for each service):**
    *   Ensure the class has the `@Service({...})` decorator (if not already present).
    *   Modify the constructor to use `@inject(...)` for *all* dependencies.
        *   Use appropriate **full interface tokens** (e.g., `@inject('IPathService')`) for standard dependencies.
        *   Use appropriate **factory tokens** (e.g., `@inject('PathServiceClientFactory')`) for dependencies involved in circular relationships, using the factory to create a client instance within the constructor or an initialization method.
    *   Remove any manual property injection logic (e.g., `this['factory'] = ...`) if replaced by constructor injection.

### Phase 3: Update Interfaces to use Full Types

*   **Objective:** Enforce stricter contracts by removing `Like` types from interfaces.
*   **Target Files:** All `I...Service.ts` files identified in Phase 1.
*   **Tasks:**
    *   Replace all usages of `...Like` types with their corresponding full interfaces (`IStateService`, `IValidationService`, `IPathService`, `IFileSystemService`, `IResolutionService`, etc.).
    *   Remove imports for `...Like` types that are no longer used.

### Phase 4: Update DI Registrations in `di-config.ts`

*   **Objective:** Transition DI configuration to container-managed resolution for core services.
*   **Target File:** `core/di-config.ts`.
*   **Tasks:**
    *   Remove all manual instantiation (`new ...`) logic for `StateService`, `ResolutionService`, `FileSystemService`, `PathService`.
    *   Remove all manual property injection logic related to these services.
    *   Remove all `container.registerInstance(...)` calls for these core services and their interfaces.
    *   Ensure these core services are registered using `container.register(..., { useClass: ... })` (using their class names as tokens).
    *   Ensure their interface tokens (`'IStateService'`, etc.) are correctly mapped using `container.register(..., { useToken: ... })` to the class registration token.
    *   Verify all necessary Client Factory registrations (`...ClientFactory`) are present and correct.
    *   Run `tsc` or the build process frequently to check for DI resolution errors as changes are made.

### Phase 5: Testing & Validation

*   **Objective:** Verify the refactored DI setup works correctly and fix resulting test failures.
*   **Tasks:**
    *   Perform a full clean build (`rm -rf dist node_modules/.cache && npm run build`).
    *   Run the full test suite (`npm test`).
    *   Debug and fix any DI resolution errors or unexpected runtime behavior introduced by the changes.
    *   Address the pre-existing test failures (the ~61 count), which should now be easier to diagnose and fix due to the improved type safety and DI consistency.
        *   Update mocks (`tests/utils/mocks/serviceMocks.ts`) to align with any changes.
        *   Update test setups (`TestContextDI`) to correctly resolve services.

## 3. Next Steps

*   Begin Phase 1: Analysis & `Like` Type Removal Prep. 