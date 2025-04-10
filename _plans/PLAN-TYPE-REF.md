# Plan: Type Reference for Refactoring

This document serves as a reference for verified type definitions and service interface details discovered during the Phase 4 handler refactoring. It aims to capture high-confidence (>98%) findings backed by direct evidence from the codebase (e.g., reading type definition files, analyzing concrete linter errors) to avoid repetitive investigation and ensure consistency.

Please update this document as more definitive information is uncovered.

## General Guidance for Refactoring (Learnings from Embed Handler)

1.  **Prioritize Interface Alignment (Solve Root Cause):** Persistent type errors often stem from mismatches between interfaces used in different contexts (e.g., `IStateService` vs `StateServiceLike`). **Before resorting to workarounds (`as any`), investigate and refactor the consuming component (e.g., `DirectiveContext`) to expect the *actual* service interface (`IStateService`) implemented by the core service and provided by mock factories.** This ensures type safety and reflects the intended architecture.
2.  **Verify Service Methods Exist:** Before implementing or testing handler logic based on plans (`@PLAN-PHASE-4.md`), **verify that the required service methods actually exist on the target service's current interface definition (`I*.ts`)**. If a method is missing (e.g., `resolveVariable`), find the appropriate *existing* method (e.g., `resolveInContext`) and update the plan/implementation accordingly.
3.  **Standardize Core Type Imports:** **Always import core types directly from their canonical source definition file** within `@core/types/` or `@core/errors/` (e.g., `import { ResolutionContext } from '@core/types/resolution.js'`). Avoid relying on potentially incomplete or outdated re-exports from intermediate files (like service interfaces or index files).
4.  **Synchronize Mock Factories:** Test mock factories (`create*Mock` in `tests/utils/mocks/serviceMocks.ts`) **must be kept synchronized with the interfaces (`I*Service`) they mock.** When an interface is updated, immediately update the factory to provide default mocks (`vi.fn()`) for all methods. Use these factories where possible. If persistent type errors occur with `DeepMockProxy`, investigate potential signature mismatches before resorting to `as any`.
5.  **Clarify Transformation Flag Role:** The `isTransformationEnabled` flag (and related `get/setTransformedNodes`, `transformNode` methods on `IStateService`) **appears primarily used by the `OutputService`** to select between original vs. transformed nodes for final rendering. Transformation seems generally **enabled by default** in end-to-end runs. Unless specifically isolating state (e.g., potentially `@import`), assume transformation is active. Directive handlers should focus on returning correct `DirectiveResult` objects.

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
    - `resolutionContext?: ResolutionContext` (Correct type)
    - `formattingContext?: {...}`
- **Usage:** Passed to `IDirectiveHandler.execute`. Test contexts need `state` and `parentState` (if applicable).

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
- **Finding:** `StateServiceLike` (defined in `@core/shared-service-types.ts`) is a broader interface than `IStateService` (defined in `services/state/StateService/IStateService.ts`). Mocks created based on `IStateService` (e.g., via `createStateServiceMock`) do not fully satisfy the `StateServiceLike` interface required by `DirectiveContext.state`.
- **Source of `StateServiceLike`:** `@core/shared-service-types.ts` (Verified by file read).
- **Key Differences:** `StateServiceLike` includes methods like `enableTransformation`, `getNodes`, `getCommand`, `setCommand`, `shouldTransform`, etc., which are absent from the stricter `IStateService` definition used by the core `StateService` implementation.
- **Evidence:** Direct comparison of `core/shared-service-types.ts` and `services/state/StateService/IStateService.ts`. Linter errors `Type '_MockProxy<IStateService> & IStateService' is missing the following properties from type 'StateServiceLike': ...` when passing `stateService` mock to `handler.execute` in tests.
- **Resolution Plan:** Refactor `DirectiveContext` (in `IDirectiveService.ts`) to use `IStateService` instead of `StateServiceLike`. This aligns the context with the actual service interface (`IStateService`) and the capabilities provided by the mock factory (`createStateServiceMock`).
    1. Modify `DirectiveContext` definition in `IDirectiveService.ts`.
    2. Address any downstream type errors caused by the change.
    3. Remove `as any` casts in test files.

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
*   Reason for `transformNode` mock signature error `Expected 0-1 type arguments, but got 2`.