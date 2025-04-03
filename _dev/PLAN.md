# Refactor meld.pegjs Grammar for Variable Consolidation and Explicit Directive Subtypes

*Status: Phase 1 & 2 Complete. Phase 3 In Progress.* 

## Introduction & Background

The current Meld parser (`core/ast/grammar/meld.pegjs`) produces distinct Abstract Syntax Tree (AST) node types for different kinds of variable references (`TextVar`, `DataVar`, `PathVar`). This necessitates a transformation step (`transformVariableNode` in `ParserService`) to consolidate these into a unified `VariableReference` node type expected by downstream services.

Similarly, directives like `@run`, `@embed`, and `@import` have functionally distinct subtypes based on their syntax (e.g., `@embed [path]`, `@embed {{variable}}`, `@embed [[template]]`). Currently, the parser often produces a generic `DirectiveNode`, and the specific subtype is determined later in the pipeline. This pushes complexity downstream and makes the raw AST less expressive.

This plan outlines refactoring the **existing** `core/ast/grammar/meld.pegjs` file to address these issues incrementally, moving towards the cleaner structure envisioned in Issue #14 without undertaking a full grammar rewrite at this time.

## Goal

Modify the **existing** `core/ast/grammar/meld.pegjs` file to:

1.  **Consolidate Variable Node Types:** Modify grammar rules to directly produce a single, unified `VariableReference` node type for all variable references (`{{text}}`, `{{data.field}}`, `$path`), incorporating a `valueType` field ('text', 'data', 'path'). *(Complete)*
2.  **Introduce Explicit Directive Subtypes:** Modify grammar rules for `@run`, `@embed`, and `@import` to explicitly determine the directive's subtype based on syntax and add a `subtype` field (e.g., `'runCommand'`, `'embedVariable'`, `'importNamed'`) to the resulting `DirectiveNode`. *(Complete)*
3.  **Simplify `validatePath` Helper & Remove Stack Trace Checks:** Opportunistically refactor the `validatePath` helper function within the grammar *and remove all other stack trace (`callerInfo`) checks* to reduce test-specific logic and improve clarity. *(In Progress)*
    *   Removed `isParserTest` checks from `@import` and `@embed` rules; updated `parser.test.ts`. *(Complete)*
    *   Simplified `validatePath` internal logic: removed flags (`isEmbedTest`, etc.), standardized `normalized` output, simplified `cwd` logic based on path structure. *(Complete)*
    *   Removed `callerInfo` checks and hardcoding from `DataDirective` and `DataValue`. *(Complete)*
    *   Remaining `callerInfo` checks (within `TextValue`, `PathDirective`, `PathValue`) need removal. *(Outstanding - Blocked by tool issue reading TextValue)*
4.  **Remove Parser Shim:** Eliminate the `transformVariableNode` function from `ParserService` once the grammar produces the consolidated variable types. *(Pending Phase 3)*

## Rationale & Motivation

*   **Simplify Pipeline:** Removes the need for post-processing shims in `ParserService` and subtype-detection logic in directive handlers.
*   **Improve AST Expressiveness:** The AST produced directly by the parser will be more accurate and informative.
*   **Enhance Type Safety & Maintainability:** A clearer, more explicit AST structure supports better compile-time checking, reduces ambiguity, and makes the codebase easier to understand and modify.
*   **Align with Long-Term Vision:** This work is a pragmatic step towards the cleaner grammar proposed in Issue #14.

## Relationship to Other Issues

*   **Informs GitHub Issue #14 (Meld Consolidated Grammar Proposal):** Implements key goals of #14 (variable consolidation, explicit subdirectives) but applies them incrementally to the *existing* `meld.pegjs` grammar. Defers the dual-grammar (`meld-strict.pegjs`) approach proposed in #14.
*   **Addresses GitHub Issue #13 (Consolidate AST / Parser Logic):** Directly contributes to the parser logic consolidation discussed in #13.

## Proposed Changes in `core/ast/grammar/meld.pegjs`

1.  **Variable Consolidation:** *(Complete)*
    *   **Target Node Structure:**
        ```typescript
        interface VariableReferenceNode {
          type: 'VariableReference';
          identifier: string; // Base name (e.g., 'myVar')
          valueType: 'text' | 'data' | 'path';
          fields?: FieldAccess[]; // For data variables (e.g., .field[0])
          format?: string; // Optional format specifier (e.g., >> json)
          isVariableReference: true; // Consistent flag
          isSpecial?: boolean; // For path variables like $HOMEPATH
          location?: SourceLocation;
        }
        ```
    *   **Grammar Rules to Modify:** Update `TextVar`, `DataVar`, `PathVar` rules (and potentially `createVariableReferenceNode` helper) to create this unified `VariableReferenceNode` directly, setting `valueType` appropriately.

2.  **`@run` Subtyping:** *(Complete)*
    *   **Target Subtypes:** `'runCommand'`, `'runCode'`, `'runCodeParams'`, `'runDefined'`.
    *   **Grammar Rules to Modify:** Update alternatives within the `RunDirective` rule to determine the subtype based on syntax (presence/absence of `lang`, `(...)` parameters, `$` prefix, bracket types) and add the `subtype` field to the `DirectiveNode`. Ensure spacing for parameters is handled consistently. Slightly refactor rule structure for clarity if beneficial.

3.  **`@embed` Subtyping:** *(Complete)*
    *   **Target Subtypes:** `'embedPath'`, `'embedVariable'`, `'embedTemplate'`.
    *   **Grammar Rules to Modify:** Update the `EmbedDirective` rule. Add logic to distinguish between a file path (`[...]`) and a variable (`{{...}}`) within single brackets (likely by inspecting content structure). Add the identified `subtype` field to the `DirectiveNode`. Slightly refactor rule structure for clarity if beneficial.

4.  **`@import` Subtyping:** *(Complete)*
    *   **Target Subtypes:** `'importAll'`, `'importStandard'`, `'importNamed'`.
    *   **Grammar Rules to Modify:** Update the `ImportDirective` rule to determine the subtype based on the import specifier structure (legacy path-only, `[*] from ...`, `[...] from ...` without aliases, `[...] from ...` with aliases). Add the identified `subtype` field to the `DirectiveNode`. Slightly refactor rule structure for clarity if beneficial.

5.  **Simplify `validatePath` Function & Remove Stack Trace Checks:** *(In Progress)*
    *   Review and refactor the `validatePath` helper function and other rules using `callerInfo`.
    *   Aim to significantly reduce reliance on test-specific logic derived from stack traces (`callerInfo`).
        *   `isParserTest` checks removed. *(Complete)*
        *   `validatePath` internal flags/logic simplified (`isEmbedTest`, `normalized`, `cwd`). *(Complete)*
        *   `DataDirective` / `DataValue` checks removed. *(Complete)*
        *   Remaining `callerInfo` checks (within `TextValue`, `PathDirective`, `PathValue`) need removal. *(Outstanding - Blocked by tool issue reading TextValue)*
    *   Improve clarity and potentially return a more standardized structure if feasible without major overhaul.

## Other Code Changes

1.  **Remove `ParserService` Shim:** *(Pending Phase 3)*
    *   Delete the `transformVariableNode` function and its usage from `services/pipeline/ParserService/ParserService.ts`.

## Scope

*   **IN SCOPE:** Modifying the existing `core/ast/grammar/meld.pegjs` file as described. Simplifying `validatePath`. Removing the `ParserService` shim. Updating affected tests.
*   **OUT OF SCOPE (for this task):** Creating a separate `meld-strict.pegjs`. Implementing a dual-grammar feature flag. Implementing the new header syntax from Issue #14. Comprehensive error message overhaul. Full refactor of `validatePath` beyond simplification.

## Impact

*   `ParserService` will be simplified.
*   Downstream services (`DirectiveService`, `ResolutionService`) can rely on a more explicit AST structure.
*   **BREAKING CHANGE:** Tests (esp. `core/ast/tests/parser.test.ts`) and potentially downstream code relying on the old specific variable node types or implicit directive subtypes will need updates.

## Testing Strategy

*   Modify existing parser tests (`core/ast/tests/parser.test.ts`) to assert the new `VariableReference` node structure and the presence/correctness of the `subtype` field on directive nodes.
*   Add new tests covering different subtype variations for `@run`, `@embed`, `@import`.
*   Run the full integration test suite (`TestContextDI`) to catch regressions in downstream services.

## Relevant Files

*   `core/ast/grammar/meld.pegjs` (Primary file to modify)
*   `services/pipeline/ParserService/ParserService.ts` (Shim removal)
*   `core/ast/tests/parser.test.ts` (Test updates)
*   Potentially files in `services/pipeline/DirectiveService/handlers/` (May be simplified by explicit subtypes)
*   Potentially `services/pipeline/ResolutionService/VariableReferenceResolver.ts` (Adapt to new variable node)

================================================

# Prior Notes

Okay, I've reviewed the type specifications (`define-spec.md`, `embed-spec.md`, `import-spec.md`, `run-spec.md`, `variables-spec.md`) and the architectural context provided in `DI-ARCHITECTURE.md`, `PIPELINE.md`, and `RUN-CLARITY.md`.

This is an impressive and thorough set of specifications! It's clear a lot of thought went into defining these types based on service lead feedback, aiming for consistency and robustness.

**Opinions on the Path Forward:**

1.  **Strongly Positive Direction:** Adopting these stricter, more expressive TypeScript types is an excellent direction for the Meld codebase. The benefits are significant:
    *   **Improved Type Safety:** Catching errors at compile time rather than runtime.
    *   **Enhanced Maintainability:** Clearer interfaces and data structures make the code easier to understand, modify, and debug.
    *   **Better Developer Experience:** Improved autocompletion and refactoring support in IDEs.
    *   **Clearer Contracts:** Explicit types serve as better documentation for the interactions between services.
    *   **Foundation for Future Work:** A well-typed codebase is easier to build upon.
2.  **Good Design Choices:** The use of discriminated unions (e.g., `RunDirective`, `EmbedParams`, `MeldVariable`) is well-suited for handling the different directive subtypes and variable kinds. The inclusion of detailed metadata (`VariableMetadata`, `SourceLocation`) and context objects (`ExecutionContext`, `ResolutionContext`) will be invaluable for debugging and implementing complex features. The path types (`MeldPath` variations) add a crucial layer of safety for file operations.
3.  **Alignment with Architecture:** The proposed types seem to align well with the described DI architecture (TSyringe, service interfaces, client factories) and the pipeline flow. Interfaces like `ICommandRegistry` or `IRunDirectiveExecutor` fit naturally into a service-oriented design.
4.  **Significant Effort:** Implementing these types across the codebase will be a substantial refactoring effort. It will touch many core services, particularly those involved in parsing, state management, resolution, and directive handling.
5.  **Complexity Management:** Some of the context objects (`ResolutionContext`) and their flags/nested contexts are quite detailed. Ensuring they are used consistently and correctly across different services will be important.

**How to Start Planning Implementation:**

This kind of large-scale refactoring benefits greatly from an incremental, phased approach. Trying to change everything at once would be risky and difficult to manage. Here's a potential plan:

**Phase 0: Preparation**

1.  **Consolidate Specs:** Ensure all final type definitions are consolidated, perhaps into dedicated `.d.ts` files within the `core/types/` directory or similar, resolving any minor inconsistencies between the spec files.
2.  **Setup:** Ensure the build and test environment is stable. Maybe introduce stricter TypeScript compiler options (`strictNullChecks`, `noImplicitAny`, etc.) if not already enabled, to help guide the refactoring.

**Phase 1: Foundational Types - Variables**

1.  **Introduce Core Variable Types:** Define `VariableType`, `BaseVariable`, `TextVariable`, `DataVariable`, `PathVariable`, `CommandVariable`, `MeldVariable`, `VariableMetadata`, `SourceLocation`, etc., based on `variables-spec.md`.
2.  **Refactor `StateService`:** This is central. Modify `StateService`'s internal storage (e.g., `textVars`, `dataVars`) to use these new, strictly-typed variable objects instead of potentially loosely typed values. Update its getter/setter methods (`getTextVar`, `setTextVar`, etc.) to work with and return these types.
3.  **Update `StateService` Tests:** Adapt existing tests and add new ones to verify the correct handling of typed variables within `StateService`.
4.  **Initial Integration:** Update direct dependents of `StateService` (like `ResolutionService`, `DirectiveService` handlers) to *expect* the new typed variables from `StateService`. This might initially involve some type assertions (`as TextVariable`) or temporary `any` types, which should be tracked for later removal.

**Phase 2: Foundational Types - Paths**

1.  **Introduce Path Types:** Define the branded path types (`NormalizedAbsoluteFilePath`, `RawPath`, etc.) and related structures (`StructuredPath`, `PathValidationContext`) from `import-spec.md`.
2.  **Refactor `PathService` & `FileSystemService`:** Update these services to use and return the new `MeldPath` types for paths. This includes methods for validation, normalization, and resolution.
3.  **Update Client Interfaces:** Modify `IPathClient` and `IFileSystemClient` to reflect the new path types. Update the corresponding factories and consuming services.
4.  **Update Tests:** Adapt tests for `PathService`, `FileSystemService`, and related path operations.

**Phase 3: Directive-Specific Refactoring (Iterative)**

*   Tackle one directive type at a time. Start with potentially simpler ones.

    *   **Example: `@define`**
        1.  Introduce `ICommandDefinition`, `ICommandParameterMetadata`, `ICommandRegistry`, etc. from `define-spec.md`.
        2.  Refactor the `@define` directive handler in `DirectiveService` to parse into and work with `ICommandDefinition`.
        3.  Update `StateService`'s command storage (`commands` map) to store `ICommandDefinition`.
        4.  Update the `@run` handler's logic for `DefinedCommandRun` (from `run-spec.md`) to retrieve and use `ICommandDefinition`.
        5.  Refactor tests for `@define` and defined command execution.

    *   **Example: `@embed`**
        1.  Introduce `EmbedType`, `EmbedParams` (and its variants `PathEmbedParams`, etc.), `VariableReference`, `EmbedResolutionContext`, `EmbedResult` from `embed-spec.md`.
        2.  Refactor the `@embed` directive handler to parse into `EmbedParams` and use the appropriate `EmbedResolutionContext`.
        3.  Update `ResolutionService` or helpers to handle the typed `VariableReference` for variable embeds.
        4.  Ensure path embeds use the new `MeldPath` types.
        5.  Refactor tests for `@embed`.

    *   **Repeat for `@run`:** Use `run-spec.md` and the plan in `RUN-CLARITY.md`. Define `RunDirective` subtypes, `ExecutionContext`, etc. Create specialized handlers (`handleBasicCommand`, `handleLanguageCommand`, `handleDefinedCommand`) as suggested.
    *   **Repeat for `@import`:** Use `import-spec.md`. Introduce `ImportDefinition`, `ImportResult`, `ImportError`, etc. Refactor the `@import` handler, paying close attention to state merging (`ImportStateChanges`, `StateMergeOptions`) and circular dependency checks using the new path types.

**Phase 4: Context Object Integration**

1.  As directives are refactored, ensure the corresponding context objects (`ExecutionContext`, `ResolutionContext`, `PathResolutionContext`, `FormattingContext`, etc.) are created and passed correctly through the service calls (`InterpreterService` -> `DirectiveService` -> `ResolutionService` -> etc.).
2.  Refine the usage of flags within these contexts (`ResolutionFlags`, `ParserFlags`) to ensure consistent behavior.

**Phase 5: Final Polish & Cleanup**

1.  **Remove Temporary Types:** Eliminate any remaining `any` types or type assertions introduced during the transition.
2.  **Review Consistency:** Perform a final pass to ensure the new types are used consistently across the entire codebase.
3.  **Update Documentation:** Update any internal documentation (`README`s, architecture diagrams) to reflect the new types and structures.

**General Approach Guidelines:**

*   **Commit Frequently:** Keep changes small and focused.
*   **Leverage Tests:** Rely heavily on the existing test suite (`TestContextDI`) and add new tests specifically targeting type correctness and edge cases introduced by the new types.
*   **Use Type Guards:** Implement and use the type guards provided in the specs (e.g., `isTextVariable`, `isPathEmbed`, `isBasicCommand`) extensively for safe type narrowing.
*   **Collaborate:** Given the scope, continuous communication and potentially pair programming on tricky parts will be essential. Lean on each other, especially if one part feels frustrating or blocked, as per the custom instructions!

This is a significant but very valuable undertaking. Starting with the foundational variable and path types seems like the most logical first step, as they underpin many other operations. Good luck!
