# Plan: Type Reference for Refactoring

This document serves as a reference for verified type definitions and service interface details discovered during the Phase 4 handler refactoring. It aims to capture high-confidence (>98%) findings backed by direct evidence from the codebase (e.g., reading type definition files, analyzing concrete linter errors) to avoid repetitive investigation and ensure consistency.

Please update this document as more definitive information is uncovered.

## Key Findings & Conventions (Learnings from Embed Handler)

1.  **Align Contexts with Core Interfaces:**
    *   **Finding:** `DirectiveContext` (defined in `IDirectiveService.ts`) required `state: StateServiceLike`, but `createStateServiceMock` provides a mock based on the narrower `IStateService`. This caused persistent type errors.
    *   **Convention:** Refactor context interfaces (like `DirectiveContext`) to expect the specific core service interface (e.g., `IStateService`) rather than broader `*-Like` types. This aligns expectations with implementations and mocks.
    *   **Status:** Prioritized. `DirectiveContext` updated.
2.  **Verify Service Methods Exist:**
    *   **Finding:** Initial refactoring assumed `IResolutionService` had methods like `resolveVariable`, `resolveTemplate`, `adjustHeadingLevels`, `wrapUnderHeader`, which were not present.
    *   **Convention:** Before implementing handler logic, verify required methods exist on the current service interface (`I*.ts` file). Use the actually available methods (e.g., `resolveInContext`, `resolveContent`, `extractSection` on `IResolutionService`).
    *   **Status:** Applied. Verified `IResolutionService` methods listed below.
3.  **Use Canonical Core Type Imports:**
    *   **Finding:** Difficulty importing `ResolutionContext`, `DataVariable`, `FieldAccessError` reliably via re-exports.
    *   **Convention:** Always import core types directly from their source definition file:
        *   `ResolutionContext` from `@core/types/resolution.js`
        *   `DataVariable` from `@core/types/variables.js`
        *   `MeldPath`, `StructuredPath` from `@core/types/paths.js`
        *   `FieldAccessError` from `@core/errors/FieldAccessError.ts`
        *   `Result`, `success`, `failure` from `@core/types/common.js`
    *   **Status:** Applied in test file refactoring.
4.  **Maintain Mock Factory Synchronization:**
    *   **Finding:** Even after updating `IStateService`, mocks from `createStateServiceMock` didn't satisfy `StateServiceLike` until the factory was explicitly updated with *all* methods.
    *   **Convention:** When a service interface (`I*Service`) changes, immediately update its corresponding mock factory (`create*Mock` in `serviceMocks.ts`) to mock *all* methods. Use factories over `mockDeep` for services. Use `as any` casts only as a last resort for persistent mock type issues, with a `// TODO:`. 
    *   **Status:** `IStateService` and `createStateServiceMock` updated.
5.  **Understand Transformation State Usage:**
    *   **Finding:** `isTransformationEnabled()` is primarily checked by `OutputService` to choose between `getOriginalNodes()` / `getNodes()` and `getTransformedNodes()`. Transformation is generally enabled via API/tests.
    *   **Convention:** Assume transformation is active unless isolating state (e.g., `@import`). Handlers return `DirectiveResult` with `replacement` nodes. `IStateService` includes necessary transformation methods (`isTransformationEnabled`, `transformNode`, `get/setTransformedNodes`, etc.).
    *   **Status:** Clarified role; methods confirmed/added to `IStateService`.
6.  **Ensure Resolution Service Handles `InterpolatableValue`:**
    *   **Finding:** `ResolutionService` (specifically methods like `resolveText`, `resolveContent`) likely still expects simple strings in many cases, rather than the `InterpolatableValue` array (`Array<TextNode | VariableReferenceNode>`) now produced by the parser for interpolated contexts (as per `@AST-VARIABLES.md`). `VariableReferenceResolver` *does* correctly handle the AST `Field` type for field access (as per `@AST-FIELD.md`).
    *   **Convention:** Refactor `ResolutionService` methods to iterate through `InterpolatableValue` arrays, resolving `VariableReferenceNode`s via `VariableReferenceResolver` and appending literal `TextNode` content. Remove internal regex-based variable searching.
    *   **Status:** **PRIORITY ISSUE.** This incomplete integration is likely a root cause of resolution inconsistencies and test failures. Needs refactoring as part of `@PLAN-PHASE-3.md`.

## Core Types (`@core/types`, `@core/syntax/types/index.js`, `@core/shared-service-types.js`)

### `ResolutionContext`
- **Source:** `@core/types/resolution.ts` (Verified by grep)
- **Definition:** Defined and exported from `@core/types/resolution.ts`.
- **Issue:** Linter sometimes reports it as not exported from `@services/resolution/ResolutionService/IResolutionService.js` when imported there. Import directly from `@core/types/resolution.js` in consuming files.
- **Evidence:** `grep` search located the definition; persistent linter errors in test files when importing through `IResolutionService`.

### `IDirectiveNode`
- **Source:** `@core/syntax/types/index.js` (Assumed based on imports)
- **Structure:**
    - Requires a `directive: DirectiveData` property.
        - **Evidence:** Linter error `Property 'directive' is missing...` when creating mock nodes in `EmbedDirectiveHandler.test.ts`.
    - The `DirectiveData` type likely requires a `kind: string` property.
        - **Evidence:** Linter error `Property 'kind' is missing in type '{}' but required in type 'DirectiveData'` when providing `directive: {}` in `EmbedDirectiveHandler.test.ts`.
    - Does *not* appear to have a top-level `name` property.
        - **Evidence:** Linter errors encountered and fixed by removing `name` from manually constructed nodes in `EmbedDirectiveHandler.test.ts`.
    - May optionally have a `subtype: string` property.
        - **Evidence:** Required by `PLAN-PHASE-4.md` for handler logic. Linter accepted it when node was cast `as DirectiveNode`. Exact definition should be confirmed.
    - May optionally have `path: MeldPath | VariableReferenceNode | ...` property depending on context/subtype.
        - **Evidence:** Used by refactored `EmbedDirectiveHandler.ts` logic based on `subtype`.
    - May optionally have `content: (TextNode | VariableReferenceNode)[]` property depending on context/subtype.
        - **Evidence:** Used by refactored `EmbedDirectiveHandler.ts` logic based on `subtype`.
    - Requires a `location: Location` property.
        - **Evidence:** Present in type definitions and test factory usage.

### `VariableReferenceNode` / `IVariableReference`
- **Source:** `@core/syntax/types/index.js` (Assumed based on imports)
- **Property:** Uses `.identifier` to store the variable name (not `.name`).
    - **Evidence:** Linter errors `Property 'name' does not exist...` resolved by changing to `.identifier` in `EmbedDirectiveHandler.test.ts` mocks.

### `DataVariable`
- **Source:** `@core/types/variables.ts` (Verified by grep)
- **Definition:** Defined and exported from `@core/types/variables.ts`.
- **Issue:** Linter sometimes reports it as not exported from `@services/state/StateService/IStateService.js` when imported there. Import directly from `@core/types/variables.js` in consuming files.
- **Evidence:** `grep` search located the definition; persistent linter errors in test files when importing through `IStateService`.

### `MeldPath`
- **Source:** `@core/types/paths.ts`
- **Definition:** Defined and exported from `@core/types/paths.ts`.
- **Structure:**
    - Discriminated union: `MeldResolvedFilesystemPath | MeldResolvedUrlPath`.
    - Returned by `IResolutionService.resolvePath`.
    - Both union members have `originalValue: string` and `validatedPath: ValidatedResourcePath` (or `UrlPath`).
    - `MeldResolvedFilesystemPath` also has `isAbsolute`, `exists`, `isSecure`, `isValidSyntax`.
    - `.raw` property does *not* exist directly on `MeldPath` or its members.
    - **Implication for FS calls:** `IFileSystemService` methods (`exists`, `readFile`) expect a `string` path. Use `resolvedPath.validatedPath` (the validated string path) when calling these services after getting a `MeldPath` from `resolvePath`.
    - **Evidence:** Direct reading of `core/types/paths.ts`. Test mocks updated to use `createMeldPath` helper and access `.validatedPath` for FS calls.

### `FieldAccessError`
- **Source:** `@core/errors/FieldAccessError.ts` (Verified by grep)
- **Definition:** Defined and exported as a class from `@core/errors/FieldAccessError.ts`.
- **Evidence:** `grep` search located the definition; linter error resolved by correcting import path.

## Service Interfaces & Contexts

### `DirectiveContext`
- **Source:** `services/pipeline/DirectiveService/IDirectiveService.ts`
- **Definition:** Defined and exported in this file.
- **Required Properties:**
    - `state: IStateService`
- **Optional Properties:**
    - `parentState?: IStateService`
    - `currentFilePath?: string`
    - `workingDirectory?: string`
    - `resolutionContext?: ResolutionContext` (Import from `@core/types/resolution.js`)
    - `formattingContext?: {...}`
- **Usage:** Passed to `IDirectiveHandler.execute`.
- **Refactoring Note:** Changed `StateServiceLike` to `IStateService` (Done).

### `IResolutionService`
- **Source:** `services/resolution/ResolutionService/IResolutionService.ts`
- **Verified Existing Methods:**
    - `resolvePath(pathString: string | StructuredPath, context: ResolutionContext): Promise<MeldPath>`
    - `resolveText(text: string, context: ResolutionContext): Promise<string>`
    - `resolveData(ref: string, context: ResolutionContext): Promise<JsonValue>`
    - `resolveFile(path: MeldPath): Promise<string>`
    - `resolveContent(nodes: MeldNode[], context: ResolutionContext): Promise<string>`
    - `resolveInContext(value: string | StructuredPath, context: ResolutionContext): Promise<string>`
    - `extractSection(content: string, sectionHeading: string, fuzzyThreshold?: number): Promise<string>`
    - `resolveFieldAccess(baseValue: unknown, fieldPath: Field[], context: ResolutionContext): Promise<Result<unknown, FieldAccessError>>`
    - `validateResolution(value: string | StructuredPath, context: ResolutionContext): Promise<void>`
    - `detectCircularReferences(value: string, context: ResolutionContext): Promise<void>`
    - `convertToFormattedString(value: JsonValue, context: ResolutionContext): Promise<string>`
- **Verified NON-Existent Methods (Do NOT use/mock):**
    - `resolveVariable`
    - `resolveTemplate`
    - `adjustHeadingLevels`
    - `wrapUnderHeader`
- **Evidence:** Direct reading of the interface definition file (`IResolutionService.ts`). Linter errors `Property 'resolveVariable' does not exist...` etc. in `EmbedDirectiveHandler.test.ts`.
- **Guidance:** Verify method existence on interface before implementing handler logic.

### `StateServiceLike` vs `IStateService`
- **Finding:** `StateServiceLike` (defined in `@core/shared-service-types.ts`) is a broader interface than `IStateService` (defined in `services/state/StateService/IStateService.ts`).
- **Source of `StateServiceLike`:** `@core/shared-service-types.ts` (Verified by file read).
- **Key Differences:** `StateServiceLike` includes methods like `getCommand`, `shouldTransform`, etc., and uses broader types (e.g., `unknown`, `string`) compared to the stricter `IStateService` (which uses `ICommandDefinition`, `CommandVariable`, `TextVariable`, etc.). *(Note: `IStateService` interface was updated to include most method *names* from `StateServiceLike`, but signature mismatches remained).* 
- **Evidence:** Direct comparison of `core/shared-service-types.ts` and `services/state/StateService/IStateService.ts`. Linter errors `Type '_MockProxy<IStateService> & IStateService' is missing the following properties from type 'StateServiceLike': ...` when passing `stateService` mock to `handler.execute` in tests.
- **Resolution (Applied):** Refactored `DirectiveContext` (in `IDirectiveService.ts`) to use `IStateService` instead of `StateServiceLike`. This aligns the context with the actual service interface (`IStateService`) and the capabilities provided by the mock factory (`createStateServiceMock`).

### `DirectiveErrorCode`
- **Source:** `services/pipeline/DirectiveService/errors/DirectiveError.ts`
- **Available Codes (Verified):** `VALIDATION_FAILED`, `RESOLUTION_FAILED`, `EXECUTION_FAILED`, `HANDLER_NOT_FOUND`, `FILE_NOT_FOUND`, `CIRCULAR_REFERENCE`, `VARIABLE_NOT_FOUND`, `STATE_ERROR`, `INVALID_CONTEXT`, `SECTION_NOT_FOUND`, `INITIALIZATION_FAILED`.
- **Non-Existent Codes:** `PROCESSING_FAILED`, `CIRCULAR_IMPORT` (use `CIRCULAR_REFERENCE`).
- **Evidence:** Direct reading of `DirectiveError.ts`.

### `InterpreterServiceClientFactory`
- **Source:** `services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory.ts`
- **Finding:** This is a **concrete class**, not an interface (`IInterpreterServiceClientFactory`). It implements `ClientFactory<IInterpreterServiceClient>`.
- **Implication:** Dependency injection and mocking should use the concrete class name and path.
- **Evidence:** Direct reading of `InterpreterServiceClientFactory.ts`. Persistent linter errors when trying to import `IInterpreterServiceClientFactory`.

## Test Utilities

### `createLocation`
- **Source:** `@tests/utils/testFactories.ts`
- **Signature:** `createLocation(startLine?: number, startColumn?: number, endLine?: number, endColumn?: number, filePath?: string): Location`. All arguments are optional. For basic location, use 4 required args: `startLine`, `startCol`, `endLine`, `endCol`.
- **Evidence:** Direct reading of `testFactories.ts` definition.

## Unresolved / Low Confidence (<98%)

*   Exact import path for `@core/ast` parser.
*   Exact structure of `DirectiveData` beyond requiring `kind`.
*   Location/implementation of heading/wrapping utilities (`adjustHeadingLevels`, `wrapUnderHeader`).
*   Verification of `FieldAccessError` export from `@core/types/common.js` (Class is in `@core/errors/FieldAccessError.ts`).
*   Correct import path for `IInterpreterServiceClient`.
*   Reason for `transformNode` mock signature error `Expected 0-1 type arguments, but got 2` (Potentially resolved by clarifying `MeldNode` usage?).