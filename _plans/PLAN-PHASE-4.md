# Plan: Phase 4 - Directive Handlers (Iterative)

## Context:
- Overall Architecture: @docs/dev/DI-ARCHITECTURE.md
- Pipeline Flow: @docs/dev/PIPELINE.md
- Current AST Structure: @docs/dev/AST.md 
- High-Level Refactoring Plan: @_plans/PLAN-TYPES.md

This document details the step-by-step implementation plan for Phase 4, focusing on refactoring individual directive handlers to use the improved AST (including `subtype` fields) and integrate with the strictly typed services refactored in previous phases.

**Assumptions:**
*   Phases 1-3 are complete: `StateService`, `PathService`, `ResolutionService` are refactored and use strict types defined in `_spec/types/`. **The `meld.pegjs` grammar has been refactored** to produce a more structured AST, including directive subtypes and parsed RHS for definition directives.
*   Core variable types (`MeldVariable` subtypes, `SourceLocation`, etc.) are defined in `core/types/variables.ts` based on `_spec/types/variables-spec.md`.
*   Core path types (`MeldPath` subtypes, `StructuredPath`, etc.) are defined in `core/types/paths.ts` based on `_spec/types/import-spec.md`.
*   The AST structure follows `docs/dev/AST.md` with explicit `subtype` fields for directives and structured RHS representations (e.g., results from `_EmbedRHS`, `_RunRHS` grammar rules).
*   Directive-specific types (e.g., `EmbedParams`, `RunDirective`, `ICommandDefinition`, `ImportDefinition`) are available, potentially imported from `_spec/types/` or defined locally within handlers initially.

## A. Type Refinement Proposals

No type refinements proposed for this phase.

## B. Detailed Implementation Plan

### 1. `@import` Handler

*   **Action:** **(Completed)** Refactor `ImportDirectiveHandler.execute` to utilize the AST `subtype` ('importAll', 'importStandard', 'importNamed') provided directly by the parser. Use the pre-validated `path` object from the AST (result of `helpers.validatePath`). Parse the `imports` array (already parsed by the grammar) into strict `ImportDefinition` types if needed (grammar structure might suffice). Call refactored services with strict types.
*   **Files:** `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.ts`
*   **Details/Considerations:**
    *   Use `node.subtype` for logic branching **(Note: Implemented via checking `imports` array content, which is functionally equivalent).**
    *   Use the `node.path` object (which includes `raw`, `structured`, `isPathVariable`, etc.) directly. Pass strict `MeldPath` representation derived from this to `FileSystemService` if needed. Resolve variables within the path *only if necessary* using `ResolutionService`. **(Completed)**
    *   Pass strict `MeldPath` to `ResolutionService` and `FileSystemService`. **(Completed)**
    *   Call refactored `ParserService.parse` and `InterpreterService.interpret` (via client factory). **(Completed)**
    *   When copying variables from `importedState` to `targetState`, ensure strict `MeldVariable` types (including `VariableMetadata` with `origin: VariableOrigin.IMPORT`, `definedAt`, etc.) are used via `StateVariableCopier`. Use the strict `MeldVariable` subtypes (`TextVariable`, `DataVariable`, `IPathVariable`, `CommandVariable`) from `variables-spec.md`. **(Completed)**
    *   **Non-destructive transformations:** The handler typically returns the modified `StateService` instance. For transformation mode (if applicable here, though less common), ensure results correctly update the transformation state without altering the original state. Return `DirectiveResult` with the state. **(Completed - Returns `DirectiveResult` with state and empty replacement node)**
    *   **`SourceLocation` Tracking:** Ensure `MeldVariable` objects copied into the `targetState` have their `metadata.definedAt` updated to point to the import statement (`node.location`) in the *importing* file, while potentially preserving original location info within `metadata.context` or `history`. **(Completed)**
*   **Testing:**
    *   Update `ImportDirectiveHandler.test.ts` and `ImportDirectiveHandler.transformation.test.ts`.
    *   Verify correct `subtype` handling based on `node.subtype` **(Completed via `imports` array check)**.
    *   Verify the handler correctly uses the pre-parsed `node.path` object. **(Completed)**

### 2. `@embed` Handler

*   **Action:** **(Completed)** Refactor `EmbedDirectiveHandler.execute` to use the `node.subtype` ('embedPath', 'embedVariable', 'embedTemplate') provided by the parser (via `_EmbedRHS`). Use the pre-parsed AST structure (`node.path` for 'embedPath', `node.content` for 'embedTemplate', `node.path` containing variable info for 'embedVariable'). Parse these structures into strict `EmbedParams` if needed, although the AST structure might be directly usable.
*   **Files:** `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.ts`
*   **Details/Considerations:**
    *   **`subtype` logic (using `node.subtype` and associated fields):** **(Completed)**
        *   `embedPath`: Use `node.path` (result of `validatePath`, including potential `interpolatedValue` array). Resolve variables within the path segments using `ResolutionService` if `node.path.structured.variables` exists. Read file content. **(Completed)**
        *   `embedVariable`: Use `node.path.variable` (the `VariableReferenceNode`) or `node.path.raw` to resolve the variable via `ResolutionService` (expecting strict `MeldVariable`). Extract string value. **(Completed)**
        *   `embedTemplate`: Use `node.content` (array of `TextNode`/`VariableReferenceNode`). Resolve variables within this array using `ResolutionService`. **(Completed)**
    *   Use `ResolutionContext` with appropriate flags (e.g., `disablePathPrefixing`) based on the subtype. **(Completed)**
    *   **Non-destructive transformations:** The primary output is the embedded content. Return `DirectiveResult` containing the `newState` (which might be unchanged if only embedding) and a `replacementNode` (a `TextNode` containing the resolved content). **(Completed)**
    *   **`SourceLocation` Tracking:** The `replacementNode`'s `location` should match the original `@embed` directive (`node.location`). The content itself doesn't inherently carry source location from its origin *within* this handler's result; tracking the origin is implicit in the embedding process. The `EmbedResult` type from the spec could be used internally or returned if needed for more complex scenarios. **(Completed)**
*   **Testing:** **(Partially Complete)**
    *   Update `EmbedDirectiveHandler.test.ts` **(Partially complete - beforeEach updated, first test case refactored for embedPath)** and `EmbedDirectiveHandler.transformation.test.ts` **(Completed - Updated for InterpreterServiceClientFactory dependency)**.
    *   Add tests specifically for each `subtype` based on `node.subtype`. **(Partially addressed - Refactored basic test covers 'embedPath')**
    *   Verify handler correctly uses pre-parsed AST fields (`node.path`, `node.content`, `node.path.variable`). **(Ongoing via test refactoring)**

### 3. `@run` Handler

*   **Action:** **(Completed)** Refactor `RunDirectiveHandler.execute` to use the `node.subtype` ('runCommand', 'runCode', 'runCodeParams', 'runDefined') provided by the parser (via `_RunRHS`). Use the pre-parsed AST structure (`node.command` which can be an array for interpolated content, a string, or a command reference object). Parse into strict `RunDirective` types if needed.
*   **Files:** `services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.ts`
*   **Details/Considerations:**
    *   **`subtype` logic (using `node.subtype` and `node.command`):**
        *   `runCommand`: `node.command` is an array (interpolated) or string. Resolve variables using `ResolutionService`. Execute. **(Completed)**
        *   `runCode`/`runCodeParams`: `node.command` is an array (interpolated). Resolve variables in `node.parameters` (if present) and `node.command` using `ResolutionService`. Execute using `node.language`. **(Completed)**
        *   `runDefined`: `node.command` is an object `{ name, args }`. Resolve the command `name` via `StateService` (expecting `CommandVariable`). Resolve arguments (`args`) using `ResolutionService`. Execute. **(Completed)**
    *   Utilize the `ExecutionContext` type from `run-spec.md` for configuring the execution environment (CWD, env vars, security). **(Consider implementing `ExecutionContext`)**
    *   Interact with the (yet to be fully defined/refactored) command execution mechanism (e.g., a dedicated `CommandExecutorService` or shell execution utility). **(Completed - Uses `FileSystemService.executeCommand`)**
    *   **Non-destructive transformations:** Return `DirectiveResult` containing the `newState` and a `replacementNode` (a `TextNode` containing the command's `stdout`). **(Completed - Logic reviewed and seems correct)**
    *   **`SourceLocation` Tracking:** The `replacementNode`'s `location` should match the original `@run` directive (`node.location`). The `ExecutionResult` type could store metadata about the execution. **(Completed)**
*   **Testing:** **(Skipped - Tests deferred to E2E)**
    *   **Note:** Unit/integration tests (`RunDirectiveHandler.test.ts`, `.integration.test.ts`) were skipped due to persistent mock complexity (see Issue #33, @_plans/E2E-CHECKS-RUN.md).
    *   Verification relies on E2E tests covering scenarios listed in `_plans/E2E-CHECKS-RUN.md`.

### 4. `@data` Handler

*   **Action:** **(In Progress)** Refactor `DataDirectiveHandler.execute` to use the pre-parsed RHS structure provided by the AST (`node.source`, `node.embed`, `node.run`, `node.value`). Calculate the value based on `node.source` and its corresponding AST object (`node.embed`, `node.run`, `node.call`, or `node.value`). Store the result using `StateService.setDataVar` with the strict `DataVariable` type.
*   **Files:** `services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.ts`
*   **Details/Considerations:**
    *   **RHS Handling (using `node.source`):** **(Completed)**
        *   `source: 'literal'`: `node.value` contains the parsed literal (object/array/primitive potentially with embedded `VariableReferenceNode`s). Resolve variables within `node.value` recursively using `ResolutionService`. **(Completed - Uses helper)**
        *   `source: 'embed'`: Use `node.embed` (result from `_EmbedRHS` with `subtype`, `path`/`content`). Perform necessary resolution/file reading based on `node.embed.subtype` similar to `@embed` handler logic, but obtain the *content* string. **Parse** this string content. **(Completed)**
        *   `source: 'run'`: Use `node.run` (result from `_RunRHS` with `subtype`, `command`). Execute the command based on `node.run.subtype` similar to `@run` handler logic, but obtain the *stdout* string. **Parse** this string output. **(Completed)**
    *   **Value Calculation:** The core task is to get the final structured data (`JsonValue`) after resolving/executing the RHS. **(Completed)**
    *   Call `newState.setDataVar(identifier, resolvedValue)`. The `resolvedValue` must be a `JsonValue`. Ensure the `DataVariable` stored includes appropriate `metadata` (e.g., `definedAt: node.location`, `origin: VariableOrigin.DIRECT_DEFINITION`). **(Completed - Relies on `StateService` for metadata. Needs verification.)**
    *   **Non-destructive transformations:** This handler modifies state. It should return the `newState` object directly (or within `DirectiveResult` if transformation mode requires specific handling, though less likely for definition handlers). **(Completed - Returns `DirectiveResult`)**
    *   **`SourceLocation` Tracking:** The `DataVariable` stored in state should have its `metadata.definedAt` set to the location of the `@data` directive (`node.location`). **(Completed - Relies on `StateService`)**
*   **Testing:**
    *   Update `DataDirectiveHandler.test.ts`.
    *   Add tests for each `source` type ('literal', 'embed', 'run', 'call') leveraging the structure provided by `node.source`, `node.embed`, `node.run`, `node.call`, `node.value`.

### 5. `@text` Handler

*   **Action:** **(Completed)** Refactor `TextDirectiveHandler.execute` similar to `@data`, using the pre-parsed RHS structure (`node.source`, `node.embed`, `node.run`, `node.value`). Calculate the final *string* value based on `node.source`. Store the result using `StateService.setTextVar` with the strict `TextVariable` type.
*   **Files:** `services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.ts`
*   **Details/Considerations:**
    *   **RHS Handling (using `node.source`):** **(Completed)**
        *   `source: 'literal'`: `node.value` is an array (interpolated string/template). Resolve variables using `ResolutionService` and join into a string. **(Completed)**
        *   `source: 'embed'`: Use `node.embed` (result from `_EmbedRHS`). Perform resolution/file reading based on `node.embed.subtype` to get the final *content string*. No parsing needed. **(Completed)**
        *   `source: 'run'`: Use `node.run` (result from `_RunRHS`). Execute based on `node.run.subtype` to get the final *stdout string*. No parsing needed. **(Completed)**
    *   **Value Calculation:** The core task is to get the final string value. **(Completed)**
    *   Call `newState.setTextVar(identifier, resolvedValue)`. The `resolvedValue` must be a `string`. Ensure the `TextVariable` stored includes appropriate `metadata` (`definedAt: node.location`, `origin: VariableOrigin.DIRECT_DEFINITION`). **(Completed - Relies on `StateService` for metadata. Needs verification.)**
    *   **Non-destructive transformations:** Return the `newState` (or within `DirectiveResult`). **(Completed - Returns `newState`)**
    *   **`SourceLocation` Tracking:** The `TextVariable` stored in state should have `metadata.definedAt` set to the `@text` directive location (`node.location`). **(Completed - Relies on `StateService`)**
    *   **DI Refactoring:** Uses `setFileSystemService` method. **(Refactor DI to use constructor injection)**
*   **Testing:**
    *   Update `TextDirectiveHandler.test.ts`, `TextDirectiveHandler.integration.test.ts`, `TextDirectiveHandler.command.test.ts`.
    *   Add tests for each `source` type ('literal', 'embed', 'run', 'call') leveraging the structure provided by `node.source`, `node.embed`, `node.run`, `node.call`, `node.value`.

### 6. `@define` Handler

*   **Action:** **(Completed)** Refactor `DefineDirectiveHandler.execute` to use the pre-parsed structure from the AST (`node.name`, `node.parameters`, `node.command` which is the result of `_RunRHS`, or `node.value` for string definitions). Parse into the strict `ICommandDefinition` union type. Store using `StateService.setCommand`.
*   **Files:** `services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.ts`
*   **Details/Considerations:**
    *   Determine `ICommandDefinition` subtype ('basic' or 'language') based on `node.command.subtype` (from `_RunRHS`) or if `node.value` is present. **(Completed)**
    *   Populate the `ICommandDefinition` object using `node.name`, `node.parameters`, `node.command` (or `node.value`). **(Completed)**
    *   Include metadata defined in the spec (`sourceLocation`, `definedAt`, etc.). **(Completed)**
    *   Call `newState.setCommand(name, commandDefinition)`. The `commandDefinition` must conform to `ICommandDefinition`. Ensure the stored `CommandVariable` (which wraps the `ICommandDefinition`) includes appropriate `metadata` (`definedAt: node.location`, `origin: VariableOrigin.DIRECT_DEFINITION`). **(Completed - Calls `setCommandVar`. Relies on `StateService`. Needs verification.)**
    *   **Non-destructive transformations:** Return the `newState` (or within `DirectiveResult`). **(Completed - Returns `newState`)**
    *   **`SourceLocation` Tracking:** The `CommandVariable` stored in state should have `metadata.definedAt` set to the `@define` directive location (`node.location`). The `ICommandDefinition` itself should also store `sourceLocation`. **(Completed - Relies on `StateService`)**
    *   **Resolution of `node.value`:** If `node.value` (InterpolatableValue) exists, it's not resolved. **(Completed)**
*   **Testing:**
    *   Update `DefineDirectiveHandler.test.ts`.
    *   Verify correct parsing based on AST structure (`node.command` vs `node.value`). **(Completed)** Add tests for subtypes and `value` resolution **(Completed - Added test for literal value)**

### 7. `@path` Handler

*   **Action:** **(Completed)** Refactor `PathDirectiveHandler.execute` to use the pre-validated `node.path` object provided by the AST (result of `helpers.validatePath`, potentially including `interpolatedValue` or `variableNode`). Resolve variables within the path using `ResolutionService` if needed. Store the result using `StateService.setPathVar` with the strict `IPathVariable` type.
*   **Files:** `services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.ts`
*   **Details/Considerations:**
    *   Use the `node.path` object directly (`raw`, `structured`, `isPathVariable`, `interpolatedValue`, `variableNode`). **(Completed)**
    *   Resolve variables within `node.path.structured.segments` using `ResolutionService` only if `node.path.structured.variables` indicates they exist (or if `node.path.interpolatedValue` contains `VariableReferenceNode`s). **(Completed - Uses `resolveInContext`)**
    *   Use `PathService` to validate and potentially normalize the fully resolved path string. **(Completed - Uses `resolvePath`)**
    *   Determine if it's a `FILESYSTEM` or `URL` path based on the structure/protocol. **For URLs, interact with `PathService.validateURL` (which uses `URLContentResolver` or similar) to perform necessary checks.** **(Completed - Handled within `resolvePath`)**
    *   Construct the `IFilesystemPathState` or `IUrlPathState` object according to `variables-spec.md`. This involves setting `contentType`, `originalValue`, `isValidSyntax`, `isSecure`, `isAbsolute`, and potentially `validatedPath` (using branded `ValidatedResourcePath`). Existence checks (`exists`) might be deferred. For URLs, set `isValidated`, `fetchStatus` (initially 'not_fetched'), **leveraging results from `PathService`/`URLContentResolver`**. **(Completed - Handled within `resolvePath`)**
    *   Call `newState.setPathVar(identifier, pathState)`. The `pathState` must conform to `IFilesystemPathState | IUrlPathState`. Ensure the stored `IPathVariable` includes appropriate `metadata` (`definedAt: node.location`, `origin: VariableOrigin.DIRECT_DEFINITION`). **(Completed - Relies on `StateService`. Needs verification.)**
    *   **Non-destructive transformations:** Return the `newState` (or within `DirectiveResult`). **(Completed - Returns `newState`)**
    *   **`SourceLocation` Tracking:** The `IPathVariable` stored in state should have `metadata.definedAt` set to the `@path` directive location (`node.location`). **(Completed - Relies on `StateService`)**
*   **Testing:**
    *   Update `PathDirectiveHandler.test.ts`.
    *   Verify correct handling of the `node.path` object from the AST (including `interpolatedValue`, `variableNode`).

---
*Note: The `@var` directive seems less frequently used or potentially deprecated based on context, but if needed, its handler would be refactored similarly to `@data`, parsing the `value` (primitive/object/array) and storing it, likely as a `DataVariable`.* 