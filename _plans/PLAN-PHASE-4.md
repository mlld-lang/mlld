# Plan: Phase 4 - Directive Handlers (Iterative)

This document details the step-by-step implementation plan for Phase 4, focusing on refactoring individual directive handlers to use the improved AST (including `subtype` fields) and integrate with the strictly typed services refactored in previous phases.

**Assumptions:**
*   Phases 1-3 are complete: `StateService`, `PathService`, `ResolutionService` are refactored and use strict types defined in `_spec/types/`.
*   Core variable types (`MeldVariable` subtypes, `SourceLocation`, etc.) are defined in `core/types/variables.ts` based on `@_spec/types/variables-spec.md`.
*   Core path types (`MeldPath` subtypes, `StructuredPath`, etc.) are defined in `core/types/paths.ts` based on `@_spec/types/import-spec.md`.
*   The AST structure follows `docs/dev/AST.md` with explicit `subtype` fields for directives.
*   Directive-specific types (e.g., `EmbedParams`, `RunDirective`, `ICommandDefinition`, `ImportDefinition`) are available, potentially imported from `_spec/types/` or defined locally within handlers initially.

## A. Type Refinement Proposals

No type refinements proposed for this phase.

## B. Detailed Implementation Plan

### 1. `@import` Handler

*   **Action:** Refactor `ImportDirectiveHandler.execute` to utilize AST `subtype` ('importAll', 'importStandard', 'importNamed') and call refactored services with strict types. Parse the AST's `path` object into a strict `PathValueObject`/`MeldPath` type. Parse `imports` array into strict `ImportDefinition` types (from `import-spec.md`).
*   **Files:** `services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler.ts`
*   **Details/Considerations:**
    *   Use `subtype` to slightly adjust logic if needed (e.g., validation for `importNamed` aliases).
    *   Pass strict `MeldPath` to `ResolutionService` and `FileSystemService`.
    *   Call refactored `ParserService.parse` and `InterpreterService.interpret` (via client factory).
    *   When copying variables from `importedState` to `targetState`, ensure strict `MeldVariable` types (including `VariableMetadata` with `origin: VariableOrigin.IMPORT`, `definedAt`, etc.) are used via `StateVariableCopier`. Use the strict `MeldVariable` subtypes (`TextVariable`, `DataVariable`, `IPathVariable`, `CommandVariable`) from `variables-spec.md`.
    *   **Non-destructive transformations:** The handler typically returns the modified `StateService` instance. For transformation mode (if applicable here, though less common), ensure results correctly update the transformation state without altering the original state. Return `DirectiveResult` with the state.
    *   **`SourceLocation` Tracking:** Ensure `MeldVariable` objects copied into the `targetState` have their `metadata.definedAt` updated to point to the import statement (`node.location`) in the *importing* file, while potentially preserving original location info within `metadata.context` or `history`.
*   **Testing:**
    *   Update `ImportDirectiveHandler.test.ts` and `ImportDirectiveHandler.transformation.test.ts`.
    *   Verify correct `subtype` handling.
    *   Verify strict types passed to/received from mocked services (`ResolutionService`, `StateService`, `FileSystemService`).
    *   Verify `MeldVariable` objects in the resulting state have correct types, values, and metadata (`origin`, `definedAt`).
    *   Test URL imports using `urlContentResolver`.

### 2. `@embed` Handler

*   **Action:** Refactor `EmbedDirectiveHandler.execute` to switch logic based on AST `subtype` ('embedPath', 'embedVariable', 'embedTemplate'). Parse the directive parameters into the strict `EmbedParams` union type (`PathEmbedParams`, `VariableEmbedParams`, `TemplateEmbedParams`) defined in `embed-spec.md`.
*   **Files:** `services/pipeline/DirectiveService/handlers/execution/EmbedDirectiveHandler.ts`
*   **Details/Considerations:**
    *   **`subtype` logic:**
        *   `embedPath`: Resolve `path` (using `ResolutionService` with strict `MeldPath`), read file (using `FileSystemService`), extract content (section, header, etc.).
        *   `embedVariable`: Resolve the `path` field (which contains a `VariableReferenceNode` structure for text/data vars or a `PathValueObject` for path vars) using `ResolutionService` (expecting a strict `MeldVariable` result). Extract the string value.
        *   `embedTemplate`: Resolve variables within the `content` string using `ResolutionService`.
    *   Use `ResolutionContext` with appropriate flags (e.g., `disablePathPrefixing`) based on the subtype.
    *   **Non-destructive transformations:** The primary output is the embedded content. Return `DirectiveResult` containing the `newState` (which might be unchanged if only embedding) and a `replacementNode` (a `TextNode` containing the resolved content).
    *   **`SourceLocation` Tracking:** The `replacementNode`'s `location` should match the original `@embed` directive (`node.location`). The content itself doesn't inherently carry source location from its origin *within* this handler's result; tracking the origin is implicit in the embedding process. The `EmbedResult` type from the spec could be used internally or returned if needed for more complex scenarios.
*   **Testing:**
    *   Update `EmbedDirectiveHandler.test.ts` and `EmbedDirectiveHandler.transformation.test.ts`.
    *   Add tests specifically for each `subtype` ('embedPath', 'embedVariable', 'embedTemplate').
    *   Verify correct parsing into `EmbedParams` subtypes.
    *   Verify calls to `ResolutionService` and `FileSystemService` use strict types.
    *   Verify the content of the `replacementNode` is correct for each subtype.
    *   Verify `SourceLocation` of the `replacementNode`.

### 3. `@run` Handler

*   **Action:** Refactor `RunDirectiveHandler.execute` to switch logic based on AST `subtype` ('runCommand', 'runCode', 'runCodeParams', 'runDefined'). Parse the directive parameters into the strict `RunDirective` union type (`BasicCommandRun`, `LanguageCommandRun`, `DefinedCommandRun`) defined in `run-spec.md`.
*   **Files:** `services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler.ts`
*   **Details/Considerations:**
    *   **`subtype` logic:**
        *   `runCommand`: Resolve variables in the `command` string using `ResolutionService`. Execute the command.
        *   `runCode`/`runCodeParams`: Resolve variables in parameters (if `runCodeParams`). Execute the `command` (script block) using the specified `language`.
        *   `runDefined`: Resolve the `command` reference (`name`, `args`) using `ResolutionService` (expecting `CommandVariable` from `StateService`). Resolve arguments. Execute the defined command logic.
    *   Utilize the `ExecutionContext` type from `run-spec.md` for configuring the execution environment (CWD, env vars, security).
    *   Interact with the (yet to be fully defined/refactored) command execution mechanism (e.g., a dedicated `CommandExecutorService` or shell execution utility).
    *   **Non-destructive transformations:** Return `DirectiveResult` containing the `newState` and a `replacementNode` (a `TextNode` containing the command's `stdout`).
    *   **`SourceLocation` Tracking:** The `replacementNode`'s `location` should match the original `@run` directive (`node.location`). The `ExecutionResult` type could store metadata about the execution.
*   **Testing:**
    *   Update `RunDirectiveHandler.test.ts`, `RunDirectiveHandler.transformation.test.ts`, `RunDirectiveHandler.integration.test.ts`.
    *   Add tests for each `subtype`.
    *   Verify parsing into `RunDirective` subtypes.
    *   Verify calls to `ResolutionService` and `StateService` (for `runDefined`).
    *   Verify interaction with the command execution mechanism.
    *   Verify the content and `SourceLocation` of the `replacementNode`.

### 4. `@data` Handler

*   **Action:** Refactor `DataDirectiveHandler.execute` to utilize the enhanced RHS AST structure (`source`, `embed.subtype`, `run.subtype`). Calculate the value based on the `source` ('literal', 'embed', 'run') and its corresponding AST details. Store the result using `StateService.setDataVar` with the strict `DataVariable` type.
*   **Files:** `services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.ts`
*   **Details/Considerations:**
    *   **RHS Handling:**
        *   `source: 'literal'`: Resolve variables within the parsed literal `value` (object/array/primitive) using `ResolutionService` recursively.
        *   `source: 'embed'`: Use the `embed` AST (`EmbedRHSAst`) mirroring `@embed` structure. Perform necessary resolution/file reading based on `embed.subtype` ('embedPath', 'embedVariable', 'embedTemplate') similar to `@embed` handler logic, but obtain the *content* string. **Parse** this string content (e.g., as JSON, YAML if hints are available or based on file extension).
        *   `source: 'run'`: Use the `run` AST (`RunRHSAst`) mirroring `@run` structure. Execute the command based on `run.subtype` ('runCommand', 'runCode', 'runDefined') similar to `@run` handler logic, but obtain the *stdout* string. **Parse** this string output (e.g., as JSON).
    *   **Value Calculation:** The core task is to get the final structured data (`JsonValue`) after resolving/executing the RHS.
    *   Call `newState.setDataVar(identifier, resolvedValue)`. The `resolvedValue` must be a `JsonValue`. Ensure the `DataVariable` stored includes appropriate `metadata` (e.g., `definedAt: node.location`, `origin: VariableOrigin.DIRECT_DEFINITION`).
    *   **Non-destructive transformations:** This handler modifies state. It should return the `newState` object directly (or within `DirectiveResult` if transformation mode requires specific handling, though less likely for definition handlers).
    *   **`SourceLocation` Tracking:** The `DataVariable` stored in state should have its `metadata.definedAt` set to the location of the `@data` directive (`node.location`).
*   **Testing:**
    *   Update `DataDirectiveHandler.test.ts`.
    *   Add tests for each `source` type ('literal', 'embed', 'run') and relevant `subtypes` within 'embed'/'run'.
    *   Verify correct value calculation for different RHS structures.
    *   Verify calls to `ResolutionService`, `FileSystemService`, command execution.
    *   Verify the `DataVariable` stored in `StateService` has the correct type, value, and metadata.

### 5. `@text` Handler

*   **Action:** Refactor `TextDirectiveHandler.execute` similar to `@data`, utilizing the enhanced RHS AST structure (`source`, `embed.subtype`, `run.subtype`). Calculate the final *string* value based on the `source`. Store the result using `StateService.setTextVar` with the strict `TextVariable` type.
*   **Files:** `services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.ts`
*   **Details/Considerations:**
    *   **RHS Handling:**
        *   `source: 'literal'`: Resolve variables within the literal `value` (string or template literal) using `ResolutionService`.
        *   `source: 'embed'`: Use the `embed` AST (`EmbedRHSAst`). Perform resolution/file reading based on `embed.subtype` to get the final *content string*. No parsing needed.
        *   `source: 'run'`: Use the `run` AST (`RunRHSAst`). Execute the command based on `run.subtype` to get the final *stdout string*. No parsing needed.
    *   **Value Calculation:** The core task is to get the final string value.
    *   Call `newState.setTextVar(identifier, resolvedValue)`. The `resolvedValue` must be a `string`. Ensure the `TextVariable` stored includes appropriate `metadata` (`definedAt: node.location`, `origin: VariableOrigin.DIRECT_DEFINITION`).
    *   **Non-destructive transformations:** Return the `newState` (or within `DirectiveResult`).
    *   **`SourceLocation` Tracking:** The `TextVariable` stored in state should have `metadata.definedAt` set to the `@text` directive location (`node.location`).
*   **Testing:**
    *   Update `TextDirectiveHandler.test.ts`, `TextDirectiveHandler.integration.test.ts`, `TextDirectiveHandler.command.test.ts`.
    *   Add tests for each `source` type ('literal', 'embed', 'run') and relevant `subtypes`.
    *   Verify correct string value calculation.
    *   Verify calls to `ResolutionService`, `FileSystemService`, command execution.
    *   Verify the `TextVariable` stored in `StateService` has the correct type, value, and metadata.

### 6. `@define` Handler

*   **Action:** Refactor `DefineDirectiveHandler.execute` to parse the directive details (`name`, `parameters`, `command` block) into the strict `ICommandDefinition` union type (`IBasicCommandDefinition` | `ILanguageCommandDefinition`) from `define-spec.md`. Store the result using `StateService.setCommand`.
*   **Files:** `services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.ts`
*   **Details/Considerations:**
    *   Determine the `ICommandDefinition` subtype ('basic' or 'language') based on the AST structure (presence of `language` field in the `command` object vs. a simple `command` string).
    *   Populate the `ICommandDefinition` object with `name`, `parameters`, `commandTemplate`/`codeBlock`, `isMultiline`, `language`, etc., based on the AST and the spec.
    *   Include metadata defined in the spec (`sourceLocation`, `definedAt`, etc.).
    *   Call `newState.setCommand(name, commandDefinition)`. The `commandDefinition` must conform to `ICommandDefinition`. Ensure the stored `CommandVariable` (which wraps the `ICommandDefinition`) includes appropriate `metadata` (`definedAt: node.location`, `origin: VariableOrigin.DIRECT_DEFINITION`).
    *   **Non-destructive transformations:** Return the `newState` (or within `DirectiveResult`).
    *   **`SourceLocation` Tracking:** The `CommandVariable` stored in state should have `metadata.definedAt` set to the `@define` directive location (`node.location`). The `ICommandDefinition` itself should also store `sourceLocation`.
*   **Testing:**
    *   Update `DefineDirectiveHandler.test.ts`.
    *   Verify correct parsing into `IBasicCommandDefinition` and `ILanguageCommandDefinition`.
    *   Verify the `CommandVariable` stored in `StateService` contains the correct `ICommandDefinition` structure and metadata.

### 7. `@path` Handler

*   **Action:** Refactor `PathDirectiveHandler.execute` to parse the AST's `path` object (`PathValueObject`) and potentially resolve it further using `PathService` and `ResolutionService` if it contains variables. Store the result using `StateService.setPathVar` with the strict `IPathVariable` type.
*   **Files:** `services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.ts`
*   **Details/Considerations:**
    *   The AST `PathValueObject` already contains structured path information (`base`, `segments`, `variables`).
    *   Resolve any variables (`{{textVar}}`, `$pathVar`) within the `path.structured.segments` using `ResolutionService`.
    *   Use `PathService` to validate and potentially normalize the fully resolved path string.
    *   Determine if it's a `FILESYSTEM` or `URL` path based on the structure/protocol. **For URLs, interact with `PathService.validateURL` (which uses `URLContentResolver` or similar) to perform necessary checks.**
    *   Construct the `IFilesystemPathState` or `IUrlPathState` object according to `variables-spec.md`. This involves setting `contentType`, `originalValue`, `isValidSyntax`, `isSecure`, `isAbsolute`, and potentially `validatedPath` (using branded `ValidatedResourcePath`). Existence checks (`exists`) might be deferred. For URLs, set `isValidated`, `fetchStatus` (initially 'not_fetched'), **leveraging results from `PathService`/`URLContentResolver`**. 
    *   Call `newState.setPathVar(identifier, pathState)`. The `pathState` must conform to `IFilesystemPathState | IUrlPathState`. Ensure the stored `IPathVariable` includes appropriate `metadata` (`definedAt: node.location`, `origin: VariableOrigin.DIRECT_DEFINITION`).
    *   **Non-destructive transformations:** Return the `newState` (or within `DirectiveResult`).
    *   **`SourceLocation` Tracking:** The `IPathVariable` stored in state should have `metadata.definedAt` set to the `@path` directive location (`node.location`).
*   **Testing:**
    *   Update `PathDirectiveHandler.test.ts`.
    *   Verify correct parsing and resolution of the `PathValueObject`.
    *   Verify interaction with `ResolutionService` and `PathService` using strict types.
    *   Verify the `IPathVariable` stored in `StateService` has the correct state (`IFilesystemPathState` or `IUrlPathState`) and metadata.
    *   Test cases with variables in paths, relative paths, absolute paths, and URLs.

---
*Note: The `@var` directive seems less frequently used or potentially deprecated based on context, but if needed, its handler would be refactored similarly to `@data`, parsing the `value` (primitive/object/array) and storing it, likely as a `DataVariable`.* 