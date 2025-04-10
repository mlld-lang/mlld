# Plan: Type Reference for Refactoring

This document serves as a reference for verified type definitions and service interface details discovered during the Phase 4 handler refactoring. It aims to capture high-confidence (>98%) findings backed by direct evidence from the codebase (e.g., reading type definition files, analyzing concrete linter errors) to avoid repetitive investigation and ensure consistency.

Please update this document as more definitive information is uncovered.

## Core Types (`@core/types`, `@core/syntax/types/index.js`)

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
- **Source:** `@core/types/common.js` (Assumed based on imports in `IResolutionService`)
- **Issue:** Linter reports it's not exported from `@core/types/common.js`. Needs verification.
- **Evidence:** Linter errors in transformation test file.

## Service Interfaces & Contexts

### `DirectiveContext`
- **Source:** `services/pipeline/DirectiveService/IDirectiveService.ts`
- **Definition:** Defined and exported in this file.
- **Required Properties:**
    - `state: StateServiceLike`
- **Optional Properties:**
    - `parentState?: StateServiceLike`
    - `currentFilePath?: string`
    - `workingDirectory?: string`
    - `resolutionContext?: ResolutionContext` (Correct type)
    - `formattingContext?: {...}`
- **Usage:** Passed to `IDirectiveHandler.execute`. Test contexts need `state` (matching `StateServiceLike`) and `parentState` (if applicable).

### `IResolutionService`
- **Source:** `services/resolution/ResolutionService/IResolutionService.ts`
- **Verified Existing Methods:**
    - `resolvePath(pathString: string | StructuredPath, context: ResolutionContext): Promise<MeldPath>` (Note: Accepts `string | StructuredPath`, not just `string`)
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

### `StateServiceLike` vs `IStateService`
- **Finding:** Mocks created based on `IStateService` (e.g., via `createStateServiceMock`) do not fully satisfy the `StateServiceLike` interface required by `DirectiveContext.state`.
- **Source of `StateServiceLike`:** Likely `@core/shared-service-types.js` (based on imports in `IDirectiveService.ts`). Needs verification.
- **Missing Properties (Observed):** `enableTransformation`, `getNodes`, `getCommand`, `setCommand`, `shouldTransform` (and potentially others).
- **Evidence:** Linter errors `Type '_MockProxy<IStateService> & IStateService' is missing the following properties from type 'StateServiceLike': ...` when passing `stateService` mock to `handler.execute` in `EmbedDirectiveHandler.test.ts`.
- **Implication:** Test mocks for `stateService` need careful construction or casting (e.g., `as any`) to satisfy `StateServiceLike` when used in `DirectiveContext`, OR the mock factory (`createStateServiceMock`) needs to be updated to return a `StateServiceLike` compatible mock, OR `DirectiveContext` needs to be updated to use `IStateService`.

### `DirectiveErrorCode`
- **Source:** `services/pipeline/DirectiveService/errors/DirectiveError.ts`
- **Available Codes (Verified):** `VALIDATION_FAILED`, `RESOLUTION_FAILED`, `EXECUTION_FAILED`, `HANDLER_NOT_FOUND`, `FILE_NOT_FOUND`, `CIRCULAR_REFERENCE`, `VARIABLE_NOT_FOUND`, `STATE_ERROR`, `INVALID_CONTEXT`, `SECTION_NOT_FOUND`, `INITIALIZATION_FAILED` (missed previously).
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
*   Full definition of `StateServiceLike` and **resolution for mismatch** with `IStateService` mocks.
*   Verification of `FieldAccessError` export from `@core/types/common.js`.
*   Correct import path for `IInterpreterServiceClient`.
*   Reason for `transformNode` mock signature error `Expected 0-1 type arguments, but got 2`.