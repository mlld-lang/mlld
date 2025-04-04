# Plan: Implement Strict Types & Refactor Pipeline Services

## Introduction

This plan outlines the next major phase of refactoring for the Meld pipeline, following the successful grammar refactors (`PLAN.md`, `PLAN-RHS.md`). The goal is to leverage the improved AST structure (unified variables, explicit subtypes) and implement the stricter TypeScript types defined in the `_spec/*.md` files (specifically the **revised** `_spec/types/variables-spec.md`) across core services.

This document provides a high-level "punch list" of objectives for each phase. Detailed implementation steps for each phase should be planned separately, involving careful review of the relevant code (`core/`, `services/`), type specifications (`_spec/`), and the updated AST structure (`docs/dev/AST.md`).

## Overall Goal

Refactor core pipeline services (`StateService`, `ResolutionService`, `PathService`, `FileSystemService`, `DirectiveService` handlers) to utilize the improved AST and implement the strict TypeScript types from `_spec/*.md` (using the **latest revisions**), enhancing type safety, maintainability, and pipeline clarity.

## Guiding Principles

*   **Centralize Core Types:** Consolidate all core type definitions from the `_spec/*.md` files into dedicated files within `core/types/` early in the process (Phase 1) to establish a single source of truth.
*   **Promote Consistency:** Utilize helper functions or factories for creating complex objects like `ResolutionContext` and `ExecutionContext` where appropriate to ensure consistency and reduce boilerplate (Phases 3, 5).
*   **Standardize Error Handling:** Ensure a consistent error handling strategy (e.g., standardized error types/codes, consistent use of `Result` vs. throwing) is applied across all refactored services (Phase 6).

## Phase 1: Foundational Types - Variables & StateService

*   **Objective:** Introduce strict types for Meld variables (including refined Path/URL and Command variables) and refactor `StateService` to manage them. Centralize core type definitions.
*   **Punch List:**
    *   **Define & Centralize Core Types:** Define core variable types (`VariableType`, `BaseVariable`, ..., `IPathVariable`, `ICommandVariable`, etc.) based on the **revised** `@_spec/types/variables-spec.md`. **Also define other core types** from specs (`ICommandDefinition`, `EmbedParams`, `RunDirective`, etc.) in corresponding `core/types/*.ts` files (e.g., `core/types/define.ts`, `core/types/embed.ts`). (Consolidate into `core/types/`).
        *   **Note:** Ensure `MeldVariable` types include robust `SourceLocation` metadata representing the origin of the value.
        *   **Note:** Confirm that these types represent the *resolved value* and associated metadata. Information about derivation via RHS operations (e.g., from `@embed`) is expected to be handled by directive handlers (Phase 4) using the AST, not stored directly in the resolved variable type itself.
    *   Refactor `IStateService` interface methods (`getTextVar`, `setTextVar`, `getDataVar`, etc.) to use/return these strict types.
    *   Refactor `StateService` implementation:
        *   Update internal storage (e.g., `textVars`, `dataVars`, `pathVars`, `commands`) to hold strictly typed variable objects.
        *   Update method implementations to align with the refactored interface.
        *   **Note:** Pay attention to `clone()` implementation. Ensure it correctly handles deep copying of typed variable objects (including new nested structures in `IPathVariable`/`CommandVariable`). Review if `StateVariableCopier` utility can be adapted for robust intra-state deep cloning, or if a dedicated utility is needed. Prevent unintended mutations across states.
    *   Update existing `StateService` unit tests (`services/state/StateService.test.ts`) to expect and verify strict types. Add new tests for type edge cases and cloning behavior.
    *   Begin updating direct dependents of `StateService` (e.g., in `ResolutionService`, handlers) to *expect* strict types (may require temporary assertions initially).

## Phase 2: Foundational Types - Paths & Path/FileSystem Services

*   **Objective:** Introduce strict types for paths and refactor path-related services.
*   **Punch List:**
    *   Define core path types (`NormalizedAbsoluteFilePath`, `RawPath`, `StructuredPath`, `PathValidationContext`, etc.) based on `_spec/import-spec.md` and potentially `_spec/path-spec.md`. (Consolidate into `core/types/paths.ts` or similar).
    *   Refactor `IPathService` interface methods to use/return these strict path types.
    *   Refactor `PathService` implementation for validation, normalization, resolution using strict types.
    *   Refactor `IFileSystemService` and `FileSystemService` methods involving paths to use strict path types.
    *   Update client interfaces (`IPathClient`, `IFileSystemClient`) and factories.
    *   Update unit tests for `PathService` and `FileSystemService`.

## Phase 3: Resolution Service

*   **Objective:** Refactor `ResolutionService` to handle unified `VariableReferenceNode` and strict types.
*   **Punch List:**
    *   Refactor `IResolutionService` interface methods.
    *   Refactor `ResolutionService` implementation:
        *   Utilize the `valueType` from `VariableReferenceNode` (from `PLAN.md`) to determine resolution strategy.
        *   Integrate with refactored `StateService` (expecting strict `MeldVariable` types).
        *   Integrate with refactored `PathService` (expecting/using strict `MeldPath` types).
        *   Introduce and utilize `ResolutionContext` (from specs) for passing context/flags. **Consider using a factory/helper** for consistent creation.
    *   Update `ResolutionService` unit tests.

## Phase 4: Directive Handlers (Iterative)

*   **Objective:** Refactor individual directive handlers to use the improved AST (subtypes) and integrate with refactored services/types (including the **revised** variable types).
*   **Punch List (Repeat for each handler - `@import`, `@embed`, `@run`, `@data`, `@text`, `@define`, `@path`, `@var`):**
    *   Identify the relevant directive-specific types from `_spec/*.md` (e.g., `EmbedParams`, `RunDirective` subtypes, `ExecutionContext`, `ImportDefinition`, `DirectiveResult`).
    *   Refactor the handler's `execute` method:
        *   Utilize the `subtype` field on the incoming `DirectiveNode` (from `PLAN.md`/`PLAN-RHS.md`) for primary logic branching.
            *   **Note (@data/@text handlers):** Explicitly leverage the enhanced RHS AST structure (`source`, `embed.subtype`, `run.subtype`) from `PLAN-RHS.md` to determine how to calculate the value before storing it via `StateService` using the **revised, appropriate `MeldVariable` type**.
        *   Parse directive parameters/values into the strict directive-specific types.
        *   Call refactored `StateService`, `ResolutionService`, `PathService` using strict types.
        *   Utilize appropriate context objects (`ExecutionContext`, `ResolutionContext`, etc.).
        *   **Note (Transformation & Location):** Define a clear strategy for handling `SourceLocation` when handlers produce replacement nodes or values during transformation. Consider if directive result types need to carry origin information. Ensure transformations do not destructively overwrite original values or metadata.
    *   Refactor the handler's unit tests to reflect the new logic and types.

## Phase 5: Interpreter Service & Pipeline Integration

*   **Objective:** Ensure seamless integration and type flow through the main pipeline orchestrator.
*   **Punch List:**
    *   Review `InterpreterService` (or equivalent pipeline orchestrator).
    *   Ensure context objects (`ExecutionContext`, `FormattingContext`, etc.) are correctly created and passed down. **Consider using factories/helpers** for consistent creation.
    *   Verify type compatibility between service calls (`ParserService` -> `InterpreterService` -> `DirectiveService` -> etc.).
    *   **Note (Transformation & Location):** Ensure the interpreter correctly handles `SourceLocation` propagation when applying transformations based on directive results.
    *   Update related integration tests if necessary.

## Phase 6: E2E Tests, Cleanup & Final Review

*   **Objective:** Validate end-to-end behavior and finalize the refactor.
*   **Punch List:**
    *   Run the full E2E test suite (including tests integrated from `e2e-fixes-embed`). Fix any failures caused by the refactoring.
    *   Remove any temporary type assertions (`as Type`, `any`) introduced during the transition.
    *   **Ensure Consistent Error Handling:** Verify that error types, codes, and patterns (`Result` vs. throw) are used consistently across the refactored services, aligning with the chosen strategy.
    *   Perform a final code review focusing on type consistency and adherence to specs.
    *   Update relevant developer documentation (`README`s, architecture docs) if needed. 