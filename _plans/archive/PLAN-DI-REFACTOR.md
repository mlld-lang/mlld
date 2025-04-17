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
*   **Tasks & Findings:**
    *   **Map Manual Instantiations/Registrations in `di-config.ts`:** (DONE)
        *   **Manually Instantiated (`new ...`):** `PathOperationsService`, `NodeFileSystem`, `ProjectPathResolver`, `URLContentResolver`, `PathService`, `PathServiceClientFactory`, `FileSystemService`, `FileSystemServiceClientFactory`, `ParserService`, `StateFactory`, `StateEventService`, `StateTrackingService`, `StateTrackingServiceClientFactory`, `StateService`, `ResolutionService`.
        *   **Registered with `registerInstance(...)`:** The instances created above were registered using `registerInstance` for both their class and interface tokens (e.g., `'IFileSystem'`, `'NodeFileSystem'`, `'PathService'`, `'IPathService'`, `'FileSystemService'`, `'IFileSystemService'`, `'StateService'`, `'IStateService'`, `'ResolutionService'`, `'IResolutionService'`, etc.).
        *   **Manual Property Injection:** `PathService` manually receives `FileSystemServiceClientFactory`; `FileSystemService` manually receives `PathServiceClient`.
        *   **Observation:** Core interdependent services (`State`, `Resolution`, `FS`, `Path`) heavily rely on manual setup, bypassing standard `tsyringe` constructor resolution.
    *   **Identify `Like` Type Usages:** (DONE)
        *   **Interfaces Extending `Like` Types:** `ICircularityService` (extends `CircularityServiceLike`), `IValidationService` (extends `ValidationServiceLike`), `IParserService` (extends `ParserServiceLike`).
        *   **Interfaces Using `Like` Types in Parameters:** `IInterpreterService.initialize` (uses `DirectiveServiceLike`), `IDirectiveService.initialize` (uses `ParserServiceLike`, `CircularityServiceLike`).
        *   **(Note:** `IResolutionService` previously used `StateServiceLike` but was updated).**
    *   **Identify Corresponding Client Factories:** (DONE)
        *   Key factories involved in cycles: `PathServiceClientFactory`, `FileSystemServiceClientFactory`, `ParserServiceClientFactory`(?), `ResolutionServiceClientFactory`(?), `StateServiceClientFactory`(?), `StateTrackingServiceClientFactory`, `InterpreterServiceClientFactory`.
    *   **Verify Client Factory Methods:** (DONE for Path/FS)
        *   `PathServiceClientFactory` exposes `resolvePath` and `normalizePath` via its client.
        *   `FileSystemServiceClientFactory` exposes `exists` and `isDirectory` via its client.
        *   **Conclusion:** These seem appropriate for breaking the Path/FS cycle. Assume other factories provide similar minimal interfaces for their respective cycles.

### Phase 2: Refactor Core Services to use `@Service` & `@inject`

*   **Objective:** Modify core service implementations to use standard DI patterns.
*   **Target Files:** `StateService.ts`, `ResolutionService.ts`, `FileSystemService.ts`, `PathService.ts` (and potentially their direct dependencies like `PathOperationsService`, `URLContentResolver` if not already decorated/injectable).
*   **Tasks (for each service):**
    *   Ensure the class has the `@Service({...})` decorator (if not already present).
    *   Modify the constructor to use `@inject(...)` for *all* dependencies.
        *   Use appropriate **full interface tokens** (e.g., `@inject('IPathService')`) for standard dependencies.
        *   Use appropriate **factory tokens** (e.g., `@inject('PathServiceClientFactory')`) for dependencies involved in circular relationships, using the factory to create a client instance within the constructor or an initialization method.
    *   Remove any manual property injection logic (e.g., `this['factory'] = ...`) if replaced by constructor injection.

### Phase 3: Update Interfaces to use Full Types

*   **Objective:** Enforce stricter contracts by removing `Like` types from interfaces.
*   **Target Files:** All `I...Service.ts` files identified in Phase 1 (`IInterpreterService`, `ICircularityService`, `IValidationService`, `IDirectiveService`, `IParserService`).
*   **Tasks:**
    *   Replace all usages of `...Like` types (extensions, parameters) with their corresponding full interfaces (`IDirectiveService`, `ICircularityService`, `IValidationService`, `IParserService` etc.).
    *   Remove imports for `...Like` types that are no longer used.

### Phase 4: Update DI Registrations in `di-config.ts`

*   **Objective:** Transition DI configuration to container-managed resolution for core services.
*   **Target File:** `core/di-config.ts`.
*   **Tasks:**
    *   Remove all manual instantiation (`new ...`) logic for `StateService`, `ResolutionService`, `FileSystemService`, `PathService` (and their manually instantiated dependencies).
    *   Remove all manual property injection logic related to these services.
    *   Remove all `container.registerInstance(...)` calls for these core services and their interfaces.
    *   Ensure these core services (and their dependencies) are registered using `container.register(..., { useClass: ... })` (using their class names as tokens).
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

*   ~~Begin Phase 1: Analysis & `Like` Type Removal Prep.~~ **Phase 1 Complete.**
*   Begin Phase 2: Refactor Core Services to use `@Service` & `@inject`.

*   Begin Phase 3: Update Interfaces to use Full Types.

*   Begin Phase 4: Update DI Registrations in `di-config.ts`.

*   Begin Phase 5: Testing & Validation. 